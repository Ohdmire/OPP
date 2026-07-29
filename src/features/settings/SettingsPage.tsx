import { useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import {
  Check,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  RotateCcw,
  Trash2,
  Volume2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMode } from "../../app/ModeContext";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  DataLine,
  InfoTip,
  SectionTitle,
} from "../../shared/components/ui";
import { desktopApi } from "../../shared/lib/tauri";
import type { AppSettings, OsuClient, Ruleset, ThemeColor } from "../../shared/types/osu";
import { useAuthStatus } from "../auth/api";
import { localSourcesKey, useLocalSources } from "../local-analysis/api";
import { useSettings, settingsQueryKey } from "./api";

const colors: Array<[ThemeColor, string, string]> = [
  ["cyan", "青色", "#67e8f9"],
  ["blue", "蓝色", "#60a5fa"],
  ["violet", "紫罗兰", "#a78bfa"],
  ["pink", "粉色", "#f472b6"],
  ["orange", "橙色", "#fb923c"],
  ["green", "绿色", "#4ade80"],
];

const modes: Array<[Ruleset, string]> = [
  ["osu", "osu!"],
  ["taiko", "Taiko"],
  ["fruits", "Catch"],
  ["mania", "Mania"],
];

const clients: Array<[OsuClient, string]> = [
  ["stable", "osu! Stable"],
  ["lazer", "osu!lazer"],
];

const base: AppSettings = {
  reduce_motion: false,
  similarity_index_directory: null,
  beatmap_download_directory: null,
  replay_export_directory: null,
  tosu_executable_path: null,
  tosu_api_base_url: "http://127.0.0.1:24050",
  launch_tosu_with_game: false,
  tosu_lyrics_executable_path: null,
  launch_tosu_lyrics_with_tosu: true,
  theme_primary: "cyan",
  theme_secondary: "cyan",
  theme_mode: "dark",
  launch_tosu_on_game_detect: false,
  game_session_analysis_on_detect: true,
  preview_volume: 65,
};

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.1] bg-white/[0.035] p-4">
      <div className="flex items-center gap-2">
        <p className="font-semibold text-slate-100">{label}</p>
        <InfoTip text={description} />
      </div>
      <Switch.Root
        checked={checked}
        className="relative h-6 w-11 shrink-0 rounded-full bg-slate-500 data-[state=checked]:bg-[var(--theme-primary)]"
        onCheckedChange={onChange}
      >
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}

export function SettingsPage() {
  const stored = useSettings();
  const auth = useAuthStatus();
  const sources = useLocalSources();
  const { ruleset, setRuleset } = useMode();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState<OsuClient | null>(null);
  const settings = { ...base, ...stored.data };

  const save = async (next: AppSettings) => {
    setBusy(true);
    try {
      queryClient.setQueryData(settingsQueryKey, await desktopApi.updateSettings(next));
    } finally {
      setBusy(false);
    }
  };

  const chooseSource = async (client: OsuClient) => {
    setSourceBusy(client);
    try {
      const source = sources.data?.find((item) => item.client === client);
      const selected = await desktopApi.chooseLocalDirectory(
        source?.configured_path ?? source?.install_root ?? source?.data_root,
      );
      if (!selected) return;
      await desktopApi.setLocalSource(client, selected);
      await queryClient.invalidateQueries({ queryKey: localSourcesKey });
    } finally {
      setSourceBusy(null);
    }
  };

  const resetSource = async (client: OsuClient) => {
    setSourceBusy(client);
    try {
      await desktopApi.resetLocalSource(client);
      await queryClient.invalidateQueries({ queryKey: localSourcesKey });
    } finally {
      setSourceBusy(null);
    }
  };

  const chooseDownloadDirectory = async () => {
    const selected = await desktopApi.chooseBeatmapDownloadDirectory(
      settings.beatmap_download_directory,
    );
    if (selected) await save({ ...settings, beatmap_download_directory: selected });
  };

  const palette = () => (
    <div>
      <p className="mb-3 text-base font-bold text-slate-100">主题色</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {colors.map(([value, label, color]) => {
          const selected = settings.theme_primary === value;
          return (
            <button
              aria-pressed={selected}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${selected ? "border-[var(--theme-primary)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary-light)] shadow-[0_0_0_2px_var(--theme-primary-soft)]" : "border-white/10 text-slate-200 hover:bg-white/[0.06]"}`}
              key={value}
              onClick={() => void save({ ...settings, theme_primary: value, theme_secondary: value })}
              type="button"
            >
              <span className="size-4 rounded-full" style={{ background: color }} />
              {label}
              {selected ? <Check className="ml-auto size-4" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );

  const lightTheme = settings.theme_mode === "light";

  return (
    <>
      <PageHeader
        eyebrow="Application"
        title="设置"
        description="在这里管理主题、游戏来源和常用偏好。"
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Card className="p-6">
            <div className="flex justify-between">
              <SectionTitle title="账户" />
              <Badge tone={auth.data?.connected ? "success" : "warning"}>
                {auth.data?.connected ? "已连接" : "未连接"}
              </Badge>
            </div>
            <div className="mt-4">
              <DataLine label="账户" value={auth.data?.username ?? "—"} />
              <DataLine label="用户 ID" value={auth.data?.user_id ?? "—"} />
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="主题" />
            <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.1] bg-white/[0.035] p-4">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-100">浅色主题</p>
                <InfoTip text="开启后使用浅色界面；关闭时使用默认深色界面。" />
              </div>
              <Switch.Root
                checked={lightTheme}
                className="relative h-6 w-11 shrink-0 rounded-full bg-slate-500 data-[state=checked]:bg-[var(--theme-primary)]"
                onCheckedChange={(value) => void save({ ...settings, theme_mode: value ? "light" : "dark" })}
              >
                <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
              </Switch.Root>
            </div>
            <div className="mt-6">{palette()}</div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="默认游戏模式" description="选择应用打开时优先使用的 osu! 游戏模式。" />
            <div className="mt-5 grid grid-cols-2 gap-2">
              {modes.map(([value, label]) => {
                const selected = ruleset === value;
                return (
                  <button
                    aria-pressed={selected}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${selected ? "border-[var(--theme-primary)] bg-[var(--theme-primary-muted)] text-[var(--theme-primary-light)]" : "border-white/10 text-slate-200 hover:bg-white/[0.06]"}`}
                    key={value}
                    onClick={() => setRuleset(value)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="试听" description="适用于在线谱面和相似谱面结果的音频试听。" />
            <label className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.035] p-4">
              <Volume2 className="size-5 text-[var(--theme-primary)]" />
              <span className="flex-1 font-semibold text-slate-100">试听音量</span>
              <span className="w-10 text-right font-mono text-sm text-slate-300">{settings.preview_volume}%</span>
              <input
                aria-label="试听音量"
                className="w-36 accent-[var(--theme-primary)]"
                max="100"
                min="0"
                onChange={(event) => void save({ ...settings, preview_volume: Number(event.target.value) })}
                type="range"
                value={settings.preview_volume}
              />
            </label>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-6">
            <SectionTitle title="游戏目录" description="为 Stable 和 lazer 分别选择 osu! 安装或数据目录，保存后会重新建立本地资源索引。" />
            <div className="mt-5 space-y-3">
              {clients.map(([client, label]) => {
                const source = sources.data?.find((item) => item.client === client);
                const path = source?.configured_path ?? source?.install_root ?? source?.data_root;
                return (
                  <div className="rounded-xl border border-white/[0.1] bg-white/[0.035] p-4" key={client}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-100">{label}</p>
                        <p className="mt-1 truncate text-xs text-slate-400" title={path ?? undefined}>
                          {path ?? "未选择目录，将自动检测"}
                        </p>
                      </div>
                      <Badge tone={source?.valid ? "success" : "warning"}>
                        {source?.valid ? "可用" : "未配置"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button loading={sourceBusy === client} onClick={() => void chooseSource(client)} size="sm" variant="secondary">
                        <FolderOpen className="size-4" />选择目录
                      </Button>
                      <Button disabled={sourceBusy !== null} onClick={() => void resetSource(client)} size="sm" variant="ghost">
                        <RotateCcw className="size-4" />自动检测
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="游戏检测自动化" />
            <div className="mt-5 space-y-3">
              <Toggle
                checked={settings.launch_tosu_on_game_detect ?? false}
                description="检测到 Stable 或 Lazer 运行时启动已配置的 tosu。"
                label="检测到游戏后启动 tosu"
                onChange={(value) => void save({ ...settings, launch_tosu_on_game_detect: value })}
              />
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="工具与缓存" />
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={busy} onClick={() => void desktopApi.clearProfileCache()}>
                <Trash2 className="size-4" />清除缓存
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle
              title="默认谱面下载位置"
              description="相似谱面和在线谱面的下载会直接保存到这里；你仍可随时修改位置。"
            />
            <div className="mt-5 rounded-xl border border-white/[0.1] bg-white/[0.035] p-4">
              <p className="text-xs text-slate-500">当前默认位置</p>
              <p className="mt-1 break-all text-sm text-slate-200">
                {settings.beatmap_download_directory ?? "尚未设置；首次下载时会询问保存位置。"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => void chooseDownloadDirectory()} size="sm" variant="secondary">
                  <FolderOpen className="size-4" />
                  {settings.beatmap_download_directory ? "修改位置" : "选择位置"}
                </Button>
                {settings.beatmap_download_directory ? (
                  <Button onClick={() => void save({ ...settings, beatmap_download_directory: null })} size="sm" variant="ghost">
                    清除默认位置
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionTitle title="关于" />
                <p className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                  <Gamepad2 className="size-4 text-[var(--theme-primary)]" />
                  OPP v0.3.0
                </p>
              </div>
              <Button onClick={() => void desktopApi.openExternal("https://github.com/L1rics06/OPP")} size="sm" variant="secondary">
                <ExternalLink className="size-4" />项目仓库
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
