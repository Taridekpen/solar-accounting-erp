import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { enrollMfa, login, verifyMfa } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-context";
import { useActionSuccess } from "@/hooks/use-action-success";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  totp: z.string().optional(),
});

type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [mfaStep, setMfaStep] = useState<"none" | "enroll" | "code">("none");
  const [secret, setSecret] = useState<string | null>(null);
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<LoginForm>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", totp: "" } });

  const signIn = useMutation({
    mutationFn: login,
    onSuccess: async (result) => {
      if (result.status === "mfa_enrollment_required") {
        const enrollment = await enrollMfa();
        setSecret(enrollment.secret);
        setMfaStep("enroll");
        return;
      }
      await refresh();
      navigate("/");
    },
    onError: (error: Error) => {
      if (error.message.includes("Authenticator code")) {
        setMfaStep("code");
        setMessage("Enter the code from your authenticator app.");
        return;
      }
      setMessage(error.message);
    },
  });
  const confirmMfa = useMutation({
    mutationFn: verifyMfa,
    onSuccess: async () => {
      await refresh();
      navigate("/");
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const signInOk = useActionSuccess(signIn);
  const confirmMfaOk = useActionSuccess(confirmMfa);
  const pending = signIn.isPending || confirmMfa.isPending;
  const success = mfaStep === "enroll" ? confirmMfaOk : signInOk;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Staff accounts are created by an administrator.</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={form.handleSubmit((values) => {
            setMessage(null);
            if (mfaStep === "enroll") {
              confirmMfa.mutate(values.totp ?? "");
              return;
            }
            signIn.mutate({ email: values.email, password: values.password, totp: values.totp || undefined });
          })}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <Input type="email" autoComplete="username" {...form.register("email")} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
          </label>
          {mfaStep !== "none" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Authenticator code</span>
              <Input inputMode="numeric" autoComplete="one-time-code" {...form.register("totp")} />
            </label>
          ) : null}
          {secret ? <p className="text-sm">Enrollment secret: <span className="font-mono">{secret}</span></p> : null}
          {notice && !message ? <p className="text-sm text-teal-700">{notice}</p> : null}
          {message ? <p className="text-sm text-rose-600">{message}</p> : null}
          <ActionButton type="submit" pending={pending} success={success}>
            {mfaStep === "enroll" ? "Enable authenticator" : "Sign in"}
          </ActionButton>
        </form>
        <p className="mt-4 text-sm text-muted">
          Have an invitation?{" "}
          <Link to="/activate" className="text-primary">
            Activate account
          </Link>
        </p>
      </Card>
    </div>
  );
}
