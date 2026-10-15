import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const sampleSchema = z.object({
  reference: z.string().min(2, "Enter at least 2 characters"),
});

export function ReferenceForm({
  onSubmit,
  pending = false,
  success = false,
}: {
  onSubmit: (reference: string) => void;
  pending?: boolean;
  success?: boolean;
}) {
  const form = useForm<{ reference: string }>({
    resolver: zodResolver(sampleSchema),
    defaultValues: { reference: "" },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit((values) => onSubmit(values.reference))}
      noValidate
    >
      <label className="block text-sm font-medium text-ink" htmlFor="reference">
        Reference
      </label>
      <Input id="reference" {...form.register("reference")} />
      {form.formState.errors.reference ? (
        <p className="text-sm text-rose-600" role="alert">
          {form.formState.errors.reference.message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => form.reset()}>
          Cancel
        </Button>
        <ActionButton type="submit" pending={pending} success={success}>
          Save
        </ActionButton>
      </div>
    </form>
  );
}
