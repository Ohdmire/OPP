import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Rocket,
  X,
} from "lucide-react";

import { settingsQueryKey } from "../settings/api";
import { Badge, Button } from "../../shared/components/ui";
import { APP_TIME_ZONE } from "../../shared/lib/format";
import { desktopApi, type UpdateCheckResult } from "../../shared/lib/tauri";
import type { AppSettings, CommandError } from "../../shared/types/osu";
import {
  MANUAL_UPDATE_CHECK_EVENT,
  type ManualUpdateCheckDetail,
} from "./events";
import { getStartupUpdateCheck, shouldShowAutomaticUpdate } from "./check";

type CheckSource = "startup" | "manual";

interface UpdateDialogState {
  source: CheckSource;
  result: UpdateCheckResult | null;
  error: string | null;
}

function errorMessage(error: unknown) {
  const commandError = error as Partial<CommandError> | null;
  return commandError?.message ?? (error instanceof Error ? error.message : String(error));
}

function publishedDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

function UpdateAnnouncementDialog({
  state,
  ignoring,
  ignoreError,
  checking,
  onClose,
  onIgnore,
  onRetry,
}: {
  state: UpdateDialogState;
  ignoring: boolean;
  ignoreError: string | null;
  checking: boolean;
  onClose: () => void;
  onIgnore: () => void;
  onRetry: () => void;
}) {
  const { result, error } = state;
  const hasUpdate = Boolean(result && !result.is_latest);

  const openRelease = () => {
    if (!result) return;
    void desktopApi.openExternal(result.release_url);
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[270] bg-black/65 backdrop-blur-sm" data-testid="update-dialog-overlay" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[280] max-h-[82vh] w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface-panel)] shadow-2xl focus:outline-none">
          <div className="flex items-start gap-4 border-b border-white/[0.08] px-6 py-5">
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${error ? "bg-rose-400/10 text-rose-300" : hasUpdate ? "bg-[var(--theme-primary-muted)] text-[var(--theme-primary)]" : "bg-emerald-400/10 text-emerald-300"}`}>
              {error ? <AlertTriangle className="size-5" /> : hasUpdate ? <Rocket className="size-5" /> : <CheckCircle2 className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-xl font-semibold text-white">
                {error ? "检查更新失败" : hasUpdate ? "发现 OPP 新版本" : "已是最新版本"}
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm leading-6 text-slate-400">
                {error
                  ? "暂时无法获取 GitHub Release 信息，你可以重试或稍后再检查。"
                  : hasUpdate
                    ? `${result?.release_name ?? result?.latest_tag} 已经发布。`
                    : `当前使用的 OPP v${result?.current_version} 已是最新版。`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button aria-label="下次再说" className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-white" type="button">
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[52vh] overflow-y-auto px-6 py-5">
            {error ? (
              <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.06] p-4 text-sm leading-6 text-rose-100">
                {error}
              </div>
            ) : hasUpdate && result ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warning">v{result.current_version} → {result.latest_tag}</Badge>
                  {publishedDate(result.published_at) ? (
                    <span className="text-xs text-slate-500">发布于 {publishedDate(result.published_at)}</span>
                  ) : null}
                </div>
                <section className="mt-5" aria-labelledby="update-release-notes-title">
                  <h3 className="text-sm font-semibold text-slate-100" id="update-release-notes-title">本次更新内容</h3>
                  <div className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-white/[0.08] bg-black/15 p-4 text-sm leading-7 text-slate-300">
                    {result.release_notes ?? "本次 Release 暂未提供更新说明，请前往发布页面查看详情。"}
                  </div>
                </section>
              </>
            ) : result ? (
              <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] p-4 text-sm leading-6 text-emerald-100">
                当前版本：OPP v{result.current_version}
              </div>
            ) : null}
            {ignoreError ? <p className="mt-3 text-sm text-rose-200">{ignoreError}</p> : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.08] px-6 py-4">
            {error ? (
              <>
                <Button onClick={onClose} variant="ghost">关闭</Button>
                <Button loading={checking} onClick={onRetry} variant="primary"><RefreshCw className="size-4" />重试</Button>
              </>
            ) : hasUpdate ? (
              <>
                <Button disabled={ignoring} onClick={onClose} variant="ghost">下次再说</Button>
                <Button loading={ignoring} onClick={onIgnore} variant="secondary">忽略此版本</Button>
                <Button onClick={openRelease} variant="primary"><ExternalLink className="size-4" />前往更新</Button>
              </>
            ) : (
              <Button onClick={onClose} variant="primary">知道了</Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function UpdateCenter({
  autoCheckReady,
  autoCheckDelayMs = 400,
  ignoredVersion,
}: {
  autoCheckReady: boolean;
  autoCheckDelayMs?: number;
  ignoredVersion?: string | null;
}) {
  const queryClient = useQueryClient();
  const autoCheckStarted = useRef(false);
  const [dialog, setDialog] = useState<UpdateDialogState | null>(null);
  const [checking, setChecking] = useState(false);
  const [ignoring, setIgnoring] = useState(false);
  const [ignoreError, setIgnoreError] = useState<string | null>(null);

  const runCheck = useCallback(async (
    source: CheckSource,
    onSettled?: () => void,
  ) => {
    setChecking(true);
    setIgnoreError(null);
    try {
      const result = source === "startup"
        ? await getStartupUpdateCheck()
        : await desktopApi.checkForUpdates();
      if (source === "manual" || shouldShowAutomaticUpdate(result, ignoredVersion)) {
        setDialog({ source, result, error: null });
      }
    } catch (error) {
      if (source === "manual") {
        setDialog({ source, result: null, error: errorMessage(error) });
      }
    } finally {
      setChecking(false);
      onSettled?.();
    }
  }, [ignoredVersion]);

  useEffect(() => {
    if (!autoCheckReady || autoCheckStarted.current) return;
    const timer = window.setTimeout(() => {
      autoCheckStarted.current = true;
      void runCheck("startup");
    }, autoCheckDelayMs);
    return () => window.clearTimeout(timer);
  }, [autoCheckDelayMs, autoCheckReady, runCheck]);

  useEffect(() => {
    const handleManualCheck = (event: Event) => {
      const detail = (event as CustomEvent<ManualUpdateCheckDetail>).detail;
      void runCheck("manual", detail?.onSettled);
    };
    window.addEventListener(MANUAL_UPDATE_CHECK_EVENT, handleManualCheck);
    return () => window.removeEventListener(MANUAL_UPDATE_CHECK_EVENT, handleManualCheck);
  }, [runCheck]);

  const close = () => {
    setDialog(null);
    setIgnoreError(null);
  };

  const ignore = async () => {
    const version = dialog?.result?.latest_version;
    if (!version) return;
    setIgnoring(true);
    setIgnoreError(null);
    try {
      const saved = await desktopApi.ignoreUpdateVersion(version);
      queryClient.setQueryData<AppSettings>(settingsQueryKey, (current) => ({
        ...(current ?? saved),
        ignored_update_version: version,
      }));
      window.dispatchEvent(new CustomEvent("opp:settings-updated", { detail: saved }));
      close();
    } catch (error) {
      setIgnoreError(errorMessage(error));
    } finally {
      setIgnoring(false);
    }
  };

  if (!dialog) return null;
  return (
    <UpdateAnnouncementDialog
      checking={checking}
      ignoreError={ignoreError}
      ignoring={ignoring}
      onClose={close}
      onIgnore={() => void ignore()}
      onRetry={() => void runCheck("manual")}
      state={dialog}
    />
  );
}
