import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopApi } from "../../shared/lib/tauri";
import type {
  SimilarityIndexStatus,
  SimilarityQueryResponse,
} from "../../shared/types/osu";
import { SimilarBeatmapsPage } from "./SimilarBeatmapsPage";

vi.mock("./SimilarityRadar", () => ({
  SimilarityRadar: ({
    comparison,
  }: {
    comparison?: Record<string, number> | null;
  }) => <div data-testid={comparison ? "comparison-radar" : "target-radar"} />,
}));

const unconfigured: SimilarityIndexStatus = {
  state: "unconfigured",
  directory: null,
  message: "尚未配置本地相似谱面索引。",
  record_count: null,
  analyzer_version: null,
  normalization_version: null,
  algorithm_id: null,
  data_cutoff_at: null,
};

const ready: SimilarityIndexStatus = {
  state: "ready",
  directory: "D:/private-index",
  message: "本地索引已就绪。",
  record_count: 3,
  analyzer_version: 2,
  normalization_version: 1,
  algorithm_id: "five-dimension-baseline-v2",
  data_cutoff_at: 1_785_140_308,
};

const feature = {
  aim: 0.7,
  speed: 0.6,
  reading: 0.8,
  flashlight: 0.2,
  overlap: 0.5,
};

const base = {
  bpm: 180,
  ar: 9,
  od: 8,
  cs: 4,
  hp: 6,
  length_seconds: 120,
  object_count: 500,
  object_density: 4.1,
  circle_ratio: 0.6,
  slider_ratio: 0.38,
  spinner_ratio: 0.02,
  max_combo: 800,
};

const response: SimilarityQueryResponse = {
  target: {
    beatmap_id: 10,
    beatmapset_id: 1,
    artist: "Reference",
    title: "Target",
    version: "Insane",
    creator: "Mapper",
    online_url: "https://osu.ppy.sh/b/10",
    difficulty: feature,
    base,
    source: "index",
    analyzer_version: 2,
    normalization_version: 1,
  },
  results: [
    {
      beatmap_id: 20,
      beatmapset_id: 2,
      artist: "Signal",
      title: "Candidate",
      version: "Another",
      creator: "Other Mapper",
      online_url: "https://osu.ppy.sh/b/20",
      difficulty: { ...feature, reading: 0.75 },
      base: { ...base, bpm: 182 },
      final_distance: 0.04,
      difficulty_distance: 0.03,
      base_distance: 0.08,
    },
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/online/similar"]}>
        <SimilarBeatmapsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SimilarBeatmapsPage", () => {
  it("treats an unconfigured private index as a normal empty state", async () => {
    vi.spyOn(desktopApi, "getSimilarityIndexStatus").mockResolvedValue(unconfigured);

    renderPage();

    expect(await screen.findByText("本地索引未配置")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查找相似谱面" })).not.toBeInTheDocument();
    expect(screen.queryByText(/下载|获取方式|文件大小/)).not.toBeInTheDocument();
  });

  it("configures a user-selected directory and immediately enables search", async () => {
    const user = userEvent.setup();
    vi.spyOn(desktopApi, "getSimilarityIndexStatus").mockResolvedValue(unconfigured);
    vi.spyOn(desktopApi, "chooseDirectory").mockResolvedValue("D:/private-index");
    const configure = vi
      .spyOn(desktopApi, "configureSimilarityIndex")
      .mockResolvedValue(ready);

    renderPage();
    await user.click(await screen.findByRole("button", { name: "选择索引目录" }));

    expect(configure).toHaveBeenCalledWith("D:/private-index");
    expect(await screen.findByText("索引已就绪")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查找相似谱面" })).toBeDisabled();
  });

  it("supports advanced parameters, result comparison and the online deep link", async () => {
    const user = userEvent.setup();
    vi.spyOn(desktopApi, "getSimilarityIndexStatus").mockResolvedValue(ready);
    const query = vi
      .spyOn(desktopApi, "querySimilarBeatmaps")
      .mockResolvedValue(response);
    vi.spyOn(desktopApi, "chooseBeatmapDownloadDirectory").mockResolvedValue("D:/downloads");
    const download = vi.spyOn(desktopApi, "downloadOnlineBeatmapsets").mockResolvedValue({
      destination: "D:/downloads",
      total: 1,
      completed: 1,
      skipped: 0,
      failed: 0,
      cancelled: false,
      failures: [],
    });

    renderPage();
    const input = await screen.findByLabelText("Beatmap ID 或 osu! 链接");
    await user.type(input, "https://osu.ppy.sh/beatmaps/10");
    await user.click(screen.getByRole("button", { name: "展开高级参数" }));
    expect(screen.getByLabelText("结果数量")).toHaveValue("20");
    await user.click(screen.getByRole("button", { name: "查找相似谱面" }));

    expect(await screen.findByText("Signal - Candidate")).toBeInTheDocument();
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: "beatmap_id",
          value: "https://osu.ppy.sh/beatmaps/10",
        },
        result_limit: 20,
      }),
    );
    expect(screen.getByTestId("comparison-radar")).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Candidate/));
    expect(download).toHaveBeenCalledWith({
      destination: "D:/downloads",
      provider: "catboy",
      overwrite: false,
      items: [{ beatmapset_id: 2, artist: "Signal", title: "Candidate" }],
    });

    await user.click(screen.getByText("在在线谱面中查看"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/online/beatmaps?beatmapset=2&beatmap=20",
    );
  });

  it("accepts a local osu file through the desktop picker", async () => {
    const user = userEvent.setup();
    vi.spyOn(desktopApi, "getSimilarityIndexStatus").mockResolvedValue(ready);
    vi.spyOn(desktopApi, "chooseSimilarityBeatmapFile").mockResolvedValue(
      "D:/maps/reference.osu",
    );

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "本地 .osu" }));
    await user.click(screen.getByRole("button", { name: "选择文件" }));

    expect(screen.getByLabelText("osu!standard 谱面文件")).toHaveValue(
      "D:/maps/reference.osu",
    );
    expect(screen.getByRole("button", { name: "查找相似谱面" })).toBeEnabled();
  });

  it("applies range sliders to the recalled candidate batch without changing the query", async () => {
    const user = userEvent.setup();
    vi.spyOn(desktopApi, "getSimilarityIndexStatus").mockResolvedValue(ready);
    const query = vi.spyOn(desktopApi, "querySimilarBeatmaps").mockResolvedValue(response);

    renderPage();
    await user.click(await screen.findByRole("tab", { name: "ID / 链接" }));
    await user.type(await screen.findByLabelText("Beatmap ID 或 osu! 链接"), "10");
    await user.click(screen.getByRole("button", { name: "查找相似谱面" }));
    expect(await screen.findByText("Signal - Candidate")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("BPM 最低"), { target: { value: "400" } });

    expect(screen.queryByText("Signal - Candidate")).not.toBeInTheDocument();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
