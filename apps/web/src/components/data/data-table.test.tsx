import { createColumnHelper } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DataTable } from "./data-table";

interface Row {
  name: string;
  code: string;
}

const columns = createColumnHelper<Row>();

describe("DataTable", () => {
  it("filters rows and shows an empty result", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={[
          columns.accessor("name", { header: "Name" }),
          columns.accessor("code", { header: "Code" }),
        ]}
        data={[{ name: "Head office", code: "HQ" }]}
        searchPlaceholder="Search rows"
      />,
    );

    expect(screen.getByText("Head office")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search rows"), "missing");
    expect(screen.getByText("No matching records")).toBeInTheDocument();
  });
});
