import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("marks and changes the selected ruleset", async () => {
    const onChange = vi.fn();
    render(<ModeSwitch onChange={onChange} value="osu" />);

    expect(screen.getByRole("tab", { name: "osu!" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(screen.getByRole("tab", { name: "mania" }));
    expect(onChange).toHaveBeenCalledWith("mania");
  });
});
