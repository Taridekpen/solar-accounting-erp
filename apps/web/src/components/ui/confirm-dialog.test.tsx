import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Post adjustment"
      description="This cannot be edited after posting."
      confirmLabel="Post"
      onConfirm={onConfirm}
    />
  );
}

describe("ConfirmDialog", () => {
  it("confirms only after the explicit action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    expect(screen.getByText("This cannot be edited after posting.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Post" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
