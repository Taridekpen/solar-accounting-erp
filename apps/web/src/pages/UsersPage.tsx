import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ActionButton, ActionTextButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { useActionSuccess, useKeyedActionSuccess } from "@/hooks/use-action-success";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/page-loader";
import { fetchBranches } from "@/features/organization/api";
import { fetchRoles, fetchUserSessions, fetchUsers, inviteUser, revokeSession, suspendUser, updateUser } from "@/features/auth/api";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  roleCode: z.string().min(1, "Choose a role"),
  branchId: z.string().optional(),
});

type InviteForm = z.infer<typeof schema>;

export function UsersPage() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roleCode, setRoleCode] = useState("");
  const [branchId, setBranchId] = useState("");
  const users = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const roles = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });
  const branches = useQuery({ queryKey: ["branches", "invite"], queryFn: () => fetchBranches() });
  const sessions = useQuery({
    queryKey: ["user-sessions", selectedId],
    queryFn: () => fetchUserSessions(selectedId ?? ""),
    enabled: Boolean(selectedId),
  });
  const form = useForm<InviteForm>({ resolver: zodResolver(schema), defaultValues: { email: "", roleCode: "", branchId: "" } });
  const invite = useMutation({
    mutationFn: (values: InviteForm) =>
      inviteUser({
        email: values.email,
        roleCodes: [values.roleCode],
        branchIds: values.branchId ? [values.branchId] : undefined,
      }),
    onSuccess: async (result) => {
      setToken(result.invitationToken);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const suspend = useMutation({
    mutationFn: suspendUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
  const saveAssignments = useMutation({
    mutationFn: () =>
      updateUser(selectedId ?? "", {
        roleCodes: roleCode ? [roleCode] : undefined,
        branchIds: branchId ? [branchId] : [],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const revoke = useMutation({
    mutationFn: revokeSession,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-sessions", selectedId] });
    },
  });
  const inviteOk = useActionSuccess(invite);
  const saveAssignmentsOk = useActionSuccess(saveAssignments);
  const suspendFx = useKeyedActionSuccess(suspend);
  const revokeFx = useKeyedActionSuccess(revoke);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Users & Roles" }]} />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Users & Roles</h1>
        <Button onClick={() => { setToken(null); setFormError(null); setOpen(true); }}>Invite staff</Button>
      </div>
      {users.isError ? <ErrorState message="Users could not be loaded." onRetry={() => void users.refetch()} /> : null}
      {users.isLoading ? <PageLoader label="Loading users…" /> : null}
      {!users.isLoading ? (
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium">Branches</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((user) => (
              <tr key={user.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{user.email}</td>
                <td className="px-4 py-3">{user.roles.map((role) => role.name).join(", ") || "—"}</td>
                <td className="px-4 py-3">{user.branches.map((branch) => branch.name).join(", ") || "Company-wide"}</td>
                <td className="px-4 py-3">{user.status}</td>
                <td className="px-4 py-3">
                  <button type="button" className="mr-3 text-primary" onClick={() => { setSelectedId(user.id); setRoleCode(user.roles[0]?.code ?? ""); setBranchId(user.branches[0]?.id ?? ""); setFormError(null); }}>
                    Manage
                  </button>
                  {user.status !== "suspended" ? (
                    <ActionTextButton
                      pending={suspendFx.isPendingFor(user.id)}
                      success={suspendFx.isSuccessFor(user.id)}
                      onClick={() => suspend.mutate(user.id)}
                    >
                      Suspend
                    </ActionTextButton>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      ) : null}
      {selectedId ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-lg font-semibold">Assignments and sessions</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Role</span>
              <select className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" value={roleCode} onChange={(event) => setRoleCode(event.target.value)}>
                <option value="">Keep current roles</option>
                {(roles.data ?? []).map((role) => (
                  <option key={role.id} value={role.code}>{role.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Branch</span>
              <select className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                <option value="">No branch assignment</option>
                {(branches.data?.data ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
          </div>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          <ActionButton type="button" onClick={() => saveAssignments.mutate()} pending={saveAssignments.isPending} success={saveAssignmentsOk}>
            Save assignments
          </ActionButton>
          <ul className="space-y-2 text-sm">
            {(sessions.data ?? []).map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 border-t border-line pt-2">
                <span>{session.revokedAt ? "Revoked" : "Active"} · {new Date(session.createdAt).toLocaleString()}</span>
                {session.revokedAt ? null : (
                  <ActionTextButton
                    pending={revokeFx.isPendingFor(session.id)}
                    success={revokeFx.isSuccessFor(session.id)}
                    onClick={() => revoke.mutate(session.id)}
                  >
                    Revoke
                  </ActionTextButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Modal open={open} onOpenChange={setOpen} title="Invite staff" description="The invitation token is shown once. There is no public registration.">
        <form className="space-y-3" onSubmit={form.handleSubmit((values) => { setFormError(null); invite.mutate(values); })}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <Input type="email" {...form.register("email")} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Role</span>
            <select className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" {...form.register("roleCode")}>
              <option value="">Select a role</option>
              {(roles.data ?? []).map((role) => (
                <option key={role.id} value={role.code}>{role.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Branch</span>
            <select className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm" {...form.register("branchId")}>
              <option value="">Company-wide role</option>
              {(branches.data?.data ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}
          {token ? (
            <div className="space-y-2 rounded-lg border border-line bg-canvas p-3 text-sm">
              <p>
                Invitation token: <span className="font-mono break-all">{token}</span>
              </p>
              <p>
                Activation link path:{" "}
                <span className="font-mono break-all">/activate?token={token}</span>
              </p>
              <p className="text-muted">
                Share the full URL (your site origin + path above) with the staff member. The token is shown once.
              </p>
            </div>
          ) : null}
          <div className="flex justify-end">
            <ActionButton type="submit" pending={invite.isPending} success={inviteOk}>Create invitation</ActionButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
