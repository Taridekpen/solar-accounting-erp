import { Check } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/page-loader";
import { cn } from "@/utils/cn";

type ActionButtonProps = ButtonProps & {
  pending?: boolean;
  success?: boolean;
  children: ReactNode;
};

export function ActionButton({
  pending = false,
  success = false,
  disabled,
  children,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button {...props} disabled={disabled || pending} aria-busy={pending || undefined} className={className}>
        {pending ? <Spinner className="h-4 w-4 shrink-0 text-current" /> : null}
        {children}
      </Button>
      {success && !pending ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Completed" />
      ) : null}
    </span>
  );
}

type ActionTextButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  success?: boolean;
  children: ReactNode;
};

export function ActionTextButton({
  pending = false,
  success = false,
  disabled,
  children,
  className,
  ...props
}: ActionTextButtonProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        {...props}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className={cn(
          "inline-flex items-center gap-1 text-primary disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        {pending ? <Spinner className="h-3.5 w-3.5 shrink-0 text-current" /> : null}
        {children}
      </button>
      {success && !pending ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Completed" />
      ) : null}
    </span>
  );
}
