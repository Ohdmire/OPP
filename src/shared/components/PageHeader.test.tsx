import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { START_PAGE_ONBOARDING_EVENT } from "../lib/onboardingEvents";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("provides a reusable page-guide entry beside the title", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener(START_PAGE_ONBOARDING_EVENT, listener);
    render(<PageHeader title="工具集合" />);

    await user.click(screen.getByRole("button", { name: "查看“工具集合”页面引导" }));
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(START_PAGE_ONBOARDING_EVENT, listener);
  });
});
