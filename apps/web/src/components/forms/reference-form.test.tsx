import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReferenceForm } from "./reference-form";

describe("ReferenceForm", () => {
  it("shows a validation error and submits a valid reference", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReferenceForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter at least 2 characters");

    await user.type(screen.getByLabelText("Reference"), "PO");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith("PO");
  });
});
