import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { ModeProvider } from "../../app/ModeContext";
import { TrainerPage } from "./TrainerPage";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <MemoryRouter initialEntries={["/online/beatmaps", "/trainer"]} initialIndex={1}>
          <Routes>
            <Route path="/trainer" element={<TrainerPage />} />
            <Route path="/local/maps" element={<h1>本地谱面目标页</h1>} />
            <Route path="/online/beatmaps" element={<h1>上一个页面</h1>} />
          </Routes>
        </MemoryRouter>
      </ModeProvider>
    </QueryClientProvider>,
  );
}

describe("TrainerPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to local beatmaps instead of returning to browser history", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "前往本地谱面" }));

    expect(screen.getByRole("heading", { name: "本地谱面目标页" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "上一个页面" })).not.toBeInTheDocument();
  });
});
