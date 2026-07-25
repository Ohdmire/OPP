import { useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  DatabaseZap,
  ExternalLink,
  LogOut,
  MonitorCog,
  RotateCcwKey,
  Trash2,
} from "lucide-react";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  DataLine,
  SectionTitle,
} from "../../shared/components/ui";
import { desktopApi } from "../../shared/lib/tauri";
import { authQueryKey, useAuthStatus } from "../auth/api";
import { useSettings, settingsQueryKey } from "./api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const auth = useAuthStatus();
  const settings = useSettings();
  const [clearing, setClearing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const updateMotion = async (reduceMotion: boolean) => {
    const next = await desktopApi.updateSettings({ reduce_motion: reduceMotion });
    queryClient.setQueryData(settingsQueryKey, next);
  };

  const clearCache = async () => {
    setClearing(true);
    setNotice(null);
    try {
      await desktopApi.clearProfileCache();
      await queryClient.invalidateQueries({ queryKey: ["own-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["best-scores"] });
      setNotice("本地缓存已清除。");
    } finally {
      setClearing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    setNotice(null);
    try {
      const result = await desktopApi.disconnectOsu(true);
      queryClient.removeQueries({ queryKey: ["own-profile"] });
      queryClient.removeQueries({ queryKey: ["best-scores"] });
      if (auth.data) {
        queryClient.setQueryData(authQueryKey, {
          ...auth.data,
          connected: false,
          user_id: null,
          username: null,
        });
      } else {
        await queryClient.invalidateQueries({ queryKey: authQueryKey });
      }
      if (result.warning) setNotice(`远程撤销失败：${result.warning}`);
    } finally {
      setDisconnecting(false);
    }
  };

  const copyCallback = async () => {
    const value = auth.data?.callback_url;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <PageHeader description="" eyebrow="" title="设置" />

      {notice ? (
        <div className="mb-5 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-4 py-3 text-xs text-cyan-100">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-[1.1fr_.9fr] gap-5">
        <Card className="p-6">
          <div className="flex items-start justify-between">
            <SectionTitle title="osu! 账号" />
            <Badge tone={auth.data?.connected ? "success" : "warning"}>
              {auth.data?.connected ? "已连接" : "未连接"}
            </Badge>
          </div>
          <div className="mt-5">
            <DataLine label="账号" value={auth.data?.username ?? "—"} />
            <DataLine label="用户 ID" value={auth.data?.user_id ?? "—"} />
            <DataLine label="Client ID" value={auth.data?.client_id ?? "—"} />
            <DataLine
              label="回调地址"
              value={
                <button
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] text-cyan-200 hover:text-cyan-100"
                  onClick={copyCallback}
                  type="button"
                >
                  {auth.data?.callback_url}
                  {copied ? (
                    <Check className="size-3" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </button>
              }
            />
          </div>
          <div className="mt-5 flex gap-3">
            <Button
              onClick={() =>
                desktopApi.openExternal("https://osu.ppy.sh/home/account/edit")
              }
            >
              <ExternalLink className="size-4" />
              管理 OAuth
            </Button>
            <Button
              loading={disconnecting}
              onClick={disconnect}
              variant="danger"
            >
              <LogOut className="size-4" />
              断开账号
            </Button>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <SectionTitle title="显示" />
            <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-white/[0.05] text-violet-200">
                  <MonitorCog className="size-4" />
                </span>
                <p className="text-sm font-medium text-white">减少动态效果</p>
              </div>
              <Switch.Root
                aria-label="减少动态效果"
                checked={settings.data?.reduce_motion ?? false}
                className="relative h-6 w-11 rounded-full bg-white/10 outline-none transition data-[state=checked]:bg-cyan-300/60 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                onCheckedChange={updateMotion}
              >
                <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-lg transition-transform data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="缓存" />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                <DatabaseZap className="size-4 text-cyan-200" />
                <p className="mt-3 text-sm font-semibold text-white">资料</p>
                <p className="mt-1 text-xs text-slate-600">5 分钟</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                <RotateCcwKey className="size-4 text-pink-200" />
                <p className="mt-3 text-sm font-semibold text-white">成绩</p>
                <p className="mt-1 text-xs text-slate-600">10 分钟</p>
              </div>
            </div>
            <Button
              className="mt-5"
              loading={clearing}
              onClick={clearCache}
            >
              <Trash2 className="size-4" />
              清除缓存
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
