import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientSwitch } from "./ClientSwitch";

describe("ClientSwitch", () => {
  it("marks and changes the selected client", async () => {
    const onChange = vi.fn();
    render(<ClientSwitch onChange={onChange} value="stable" />);

    expect(screen.getByRole("tab", { name: "Stable" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(screen.getByRole("tab", { name: "Lazer" }));
    expect(onChange).toHaveBeenCalledWith("lazer");
  });
});
