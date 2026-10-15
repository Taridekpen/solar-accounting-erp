import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, Menu, Moon, Search, Sun, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ActionButton, ActionTextButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { changePassword, logout } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
} from "@/features/notifications/api";
import { useActionSuccess, useKeyedActionSuccess } from "@/hooks/use-action-success";
import { useUi } from "@/stores/ui-context";

export function Header() {
  const { setMobileNavOpen, theme, setTheme, selectedBranchIds, setSelectedBranchIds } = useUi();
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const branches = session?.branches ?? [];
  const selected = branches.filter((branch) => selectedBranchIds.includes(branch.id));
  const branchLabel = selected.length === 0 ? "All branches" : selected.length === 1 ? selected[0].name : `${selected.length} branches`;
  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds(
      selectedBranchIds.includes(branchId)
        ? selectedBranchIds.filter((id) => id !== branchId)
        : [...selectedBranchIds, branchId],
    );
  };
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const canNotify = session?.permissions.includes("notifications.view") ?? false;
  const unread = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: fetchUnreadNotificationCount,
    enabled: Boolean(session && canNotify),
    refetchInterval: 60_000,
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    enabled: notificationsOpen && canNotify,
  });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.clear();
      await refresh();
      navigate("/login");
    },
  });
  const savePassword = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setPasswordMessage("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (error: Error) => setPasswordMessage(error.message),
  });
  const savePasswordOk = useActionSuccess(savePassword);
  const refreshAlerts = useMutation({
    mutationFn: refreshNotifications,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });
  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });
  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });
  const refreshOk = useActionSuccess(refreshAlerts);
  const markAllOk = useActionSuccess(markAllRead);
  const markReadFx = useKeyedActionSuccess(markRead);

  return (
    <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-card px-4">
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line lg:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="hidden h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm sm:inline-flex">
          <span className="max-w-40 truncate">{branchLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-30 max-h-80 min-w-56 overflow-auto rounded-xl border border-line bg-card p-1 shadow-card" align="start" sideOffset={8}>
            <DropdownMenu.Item
              className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none hover:bg-canvas"
              onSelect={() => setSelectedBranchIds([])}
            >
              All branches
            </DropdownMenu.Item>
            {branches.map((branch) => (
              <DropdownMenu.Item
                key={branch.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm outline-none hover:bg-canvas"
                onSelect={(event) => {
                  event.preventDefault();
                  toggleBranch(branch.id);
                }}
              >
                <span className="flex items-center gap-2">
                  <input type="checkbox" readOnly checked={selectedBranchIds.includes(branch.id)} aria-label={branch.name} />
                  <span>{branch.name}</span>
                </span>
                {branch.status === "inactive" ? <span className="text-xs text-muted">Inactive</span> : null}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="mx-auto w-full max-w-xl">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-muted"
        >
          <Search className="h-4 w-4" />
          Search anything...
        </button>
      </div>

      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line"
        aria-label="Notifications"
        onClick={() => setNotificationsOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {(unread.data?.count ?? 0) > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
            {unread.data?.count}
          </span>
        ) : null}
      </button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-medium leading-4 text-ink">{session?.user.email ?? "Account"}</span>
            <span className="block text-[11px] leading-4 text-muted">{session?.user.mfaEnabled ? "MFA enabled" : "Account"}</span>
          </span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-30 min-w-44 rounded-xl border border-line bg-card p-1 shadow-card" align="end" sideOffset={8}>
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-canvas"
              onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none hover:bg-canvas"
              onSelect={() => setPasswordOpen(true)}
            >
              Change password
            </DropdownMenu.Item>
            <DropdownMenu.Item className="rounded-lg px-3 py-2 text-sm text-muted outline-none" disabled>
              {session?.user.mfaEnabled ? "Authenticator enabled" : "Authenticator required before access"}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none hover:bg-canvas"
              disabled={signOut.isPending}
              onSelect={() => signOut.mutate()}
            >
              {signOut.isPending ? "Signing out…" : "Sign out"}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Modal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search"
        description="Global search will include customers, invoices, and accounts when those modules are available."
      >
        <p className="text-sm text-muted">No records to search yet.</p>
      </Modal>
      <Modal
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        title="Notifications"
        description="Approval requests, overdue invoices, low stock, and posting failures."
      >
        <div className="mb-3 flex gap-2">
          <ActionButton
            type="button"
            variant="secondary"
            size="sm"
            pending={refreshAlerts.isPending}
            success={refreshOk}
            onClick={() => refreshAlerts.mutate()}
          >
            Refresh alerts
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            size="sm"
            pending={markAllRead.isPending}
            success={markAllOk}
            onClick={() => markAllRead.mutate()}
          >
            Mark all read
          </ActionButton>
        </div>
        {(notifications.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">No notifications.</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {(notifications.data ?? []).map((item) => (
              <li key={item.id} className={`rounded-lg border border-line p-3 ${item.readAt ? "opacity-70" : ""}`}>
                <div className="font-medium">{item.title}</div>
                <div className="text-muted">{item.body}</div>
                <div className="mt-2 flex gap-3">
                  {item.linkPath ? (
                    <Link className="text-primary" to={item.linkPath} onClick={() => setNotificationsOpen(false)}>
                      Open
                    </Link>
                  ) : null}
                  {!item.readAt ? (
                    <ActionTextButton
                      pending={markReadFx.isPendingFor(item.id)}
                      success={markReadFx.isSuccessFor(item.id)}
                      onClick={() => markRead.mutate(item.id)}
                    >
                      Mark read
                    </ActionTextButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <Modal open={passwordOpen} onOpenChange={setPasswordOpen} title="Change password">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPasswordMessage(null);
            savePassword.mutate();
          }}
        >
          <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" aria-label="Current password" />
          <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" aria-label="New password" />
          {passwordMessage ? <p className="text-sm text-muted">{passwordMessage}</p> : null}
          <ActionButton type="submit" pending={savePassword.isPending} success={savePasswordOk}>
            Save password
          </ActionButton>
        </form>
      </Modal>
    </header>
  );
}
