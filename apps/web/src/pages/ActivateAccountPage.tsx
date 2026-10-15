import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { activateAccount } from "@/features/auth/api";
import { useActionSuccess } from "@/hooks/use-action-success";

const schema = z
  .object({
    token: z.string().trim().min(20, "Enter the invitation token from your administrator"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ActivateForm = z.infer<typeof schema>;

export function ActivateAccountPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<ActivateForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      token: searchParams.get("token") ?? "",
      password: "",
      confirmPassword: "",
    },
  });

  const activate = useMutation({
    mutationFn: (values: ActivateForm) => activateAccount(values.token, values.password),
    onSuccess: () => {
      navigate("/login", { replace: true, state: { notice: "Account activated. You can sign in now." } });
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const activateOk = useActionSuccess(activate);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Activate account</h1>
        <p className="mt-1 text-sm text-muted">
          Paste the invitation token from your administrator and choose a password.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={form.handleSubmit((values) => {
            setMessage(null);
            activate.mutate(values);
          })}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Invitation token</span>
            <Input autoComplete="off" spellCheck={false} {...form.register("token")} />
            {form.formState.errors.token ? (
              <p className="mt-1 text-sm text-rose-600">{form.formState.errors.token.message}</p>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
            {form.formState.errors.password ? (
              <p className="mt-1 text-sm text-rose-600">{form.formState.errors.password.message}</p>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Confirm password</span>
            <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
            {form.formState.errors.confirmPassword ? (
              <p className="mt-1 text-sm text-rose-600">{form.formState.errors.confirmPassword.message}</p>
            ) : null}
          </label>
          {message ? <p className="text-sm text-rose-600">{message}</p> : null}
          <ActionButton type="submit" pending={activate.isPending} success={activateOk}>
            Activate account
          </ActionButton>
        </form>
        <p className="mt-4 text-sm text-muted">
          Already activated?{" "}
          <Link to="/login" className="text-primary">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
