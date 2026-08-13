import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopApi } from "../shared/lib/tauri";
import type { AppSettings, DanserRenderPreferences, NewReplaysDetected } from "../shared/types/osu";
import { GameCompletionOverlay } from "./AppShell";

const preferences: DanserRenderPreferences = {
  settings_profile: "default", skin: "", skip: true, quickstart: false,
  start: null, end: null, speed: 1, pitch: 1, offset: 0, mods: "", mods2: "",
  cs: null, ar: null, od: null, hp: null, no_db_check: true,
  no_update_check: true, debug: false, settings_patch: "",
  frame_width: 1920, frame_height: 1080, fps: 60, encoder: "libx264",
  quality: 14, motion_blur: false, motion_blur_oversample: 16,
};

const discovery: NewReplaysDetected = {
  client: "stable",
  started_at: "2026-08-13T10:00:00Z",
  detected_at: "2026-08-13T10:05:00Z",
  replays: [{
    path: "C:\\osu!\\Replays\\new.osr",
    file_name: "new.osr",
    beatmap_title: "Artist — Song [Insane]",
    username: "Player",
    renderable: true,
    reason: null,
  }],
};

afterEach(() => vi.restoreAllMocks());

describe("GameCompletionOverlay", () => {
  it("allows a replay to be selected and queued without starting rendering", async () => {
    const user = userEvent.setup();
    vi.spyOn(desktopApi, "getDanserStatus").mockResolvedValue({
      available: true,
      executable_path: "C:\\danser\\danser-cli.exe",
      ffmpeg_available: true,
      profiles: ["default"],
      message: "ready",
    });
    const enqueue = vi.spyOn(desktopApi, "enqueueDanserRenders").mockResolvedValue([]);
    const start = vi.spyOn(desktopApi, "startDanserRenderQueue").mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(<GameCompletionOverlay
      discovery={discovery}
      onClose={onClose}
      onNavigate={onNavigate}
      session={null}
      settings={{
        auto_export_new_replays_with_danser: false,
        replay_export_directory: "D:\\renders",
        danser_render_preferences: preferences,
      } as AppSettings}
    />);

    const checkbox = screen.getByRole("checkbox", { name: "选择 Artist — Song [Insane]" });
    expect(checkbox).toBeEnabled();
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    await user.click(await screen.findByRole("button", { name: "加入渲染队列" }));

    expect(enqueue).toHaveBeenCalledWith({
      client: "stable",
      replay_paths: ["C:\\osu!\\Replays\\new.osr"],
      preferences,
    });
    expect(start).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("/local/media/render");
  });
});
