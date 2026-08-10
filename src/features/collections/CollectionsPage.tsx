import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBeforeUnload, useNavigate } from "react-router-dom";
import {
  Download,
  FileInput,
  FileOutput,
  FolderPlus,
  Heart,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button, Card, EmptyState } from "../../shared/components/ui";
import { PageHeader } from "../../shared/components/PageHeader";
import { desktopApi } from "../../shared/lib/tauri";
import type {
  CollectionFolder,
  CollectionSharePreview,
  CommandError,
} from "../../shared/types/osu";
import { resolveDefaultDownloadProvider } from "../online-beatmaps/downloadProvider";
import { useSettings } from "../settings/api";
import { collectionsQueryKey, useCollections, useRefreshCollections } from "./api";

async function copy(value: string) {
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
}

function ImportPreviewDialog({
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  preview: CollectionSharePreview | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root onOpenChange={(open) => !open && onCancel()} open={Boolean(preview)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[260] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[270] flex max-h-[min(760px,calc(100vh-32px))] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#101724] shadow-2xl outline-none">
          {preview ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-6">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-white">导入预览：{preview.name}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-slate-400">
                    创建者 {preview.creator || "未署名"} · {new Date(preview.created_at).toLocaleString()}
                  </Dialog.Description>
                </div>
                <Dialog.Close className="text-slate-500 hover:text-white"><X className="size-5" /></Dialog.Close>
              </div>
              <div className="grid grid-cols-3 gap-3 border-b border-white/[0.08] p-5 text-center text-sm">
                <span className="rounded-lg bg-black/15 p-3 text-slate-200">{preview.entries.length}<small className="mt-1 block text-slate-500">难度</small></span>
                <span className="rounded-lg bg-black/15 p-3 text-emerald-200">{preview.downloadable_count}<small className="mt-1 block text-slate-500">可下载</small></span>
                <span className="rounded-lg bg-black/15 p-3 text-amber-200">{preview.unresolved_count}<small className="mt-1 block text-slate-500">无法下载</small></span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="mb-3 text-xs text-slate-500">将导入以下难度（在线分享码为保持短小，只保存精确谱面 ID）：</p>
                <div className="space-y-1.5">
                  {preview.entries.map((entry, index) => (
                    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5" key={entry.id}>
                      <span className={`size-2 rounded-full ${entry.resolved ? "bg-emerald-300" : entry.beatmapset_id ? "bg-cyan-300" : "bg-amber-300"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-200">{entry.title || `谱面 #${entry.beatmap_id ?? index + 1}`} <span className="text-slate-500">[{entry.difficulty_name}]</span></p>
                        <p className="truncate text-xs text-slate-600">{entry.beatmapset_id ? `谱面集 #${entry.beatmapset_id} · 难度 #${entry.beatmap_id}` : entry.artist || "本地谱面引用"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-white/[0.08] p-5">
                <Button disabled={busy} onClick={onCancel} variant="ghost">取消</Button>
                <Button loading={busy} onClick={onConfirm}>确认导入为新收藏夹</Button>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FolderCard({ folder, onChanged }: { folder: CollectionFolder; onChanged: () => void }) {
  const settings = useSettings();
  const [exported, setExported] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (entryId?: string) => {
    setBusy(true);
    try {
      if (entryId) await desktopApi.removeCollectionEntry(folder.id, entryId);
      else await desktopApi.deleteCollection(folder.id);
      onChanged();
    } catch (caught) { setError((caught as CommandError).message ?? String(caught)); }
    finally { setBusy(false); }
  };
  const exportShare = async () => {
    setBusy(true);
    try {
      const code = await desktopApi.exportCollectionShare(folder.id, folder.creator);
      setExported(code);
      await copy(code);
    } catch (caught) { setError((caught as CommandError).message ?? String(caught)); }
    finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try {
      const items = await desktopApi.getCollectionDownloadItems(folder.id);
      let destination = settings.data?.beatmap_download_directory ?? "";
      if (!destination) destination = await desktopApi.chooseBeatmapDownloadDirectory(null) ?? "";
      if (!destination || !items.length) return;
      await desktopApi.downloadOnlineBeatmapsets({ destination, provider: resolveDefaultDownloadProvider(settings.data), overwrite: false, items });
    } catch (caught) { setError((caught as CommandError).message ?? String(caught)); }
    finally { setBusy(false); }
  };

  return <Card className="collection-folder overflow-hidden"><div className="flex items-start justify-between gap-4 border-b border-white/[0.07] p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-semibold text-white">{folder.name}</h2>{folder.read_only ? <span className="rounded bg-amber-300/10 px-2 py-0.5 text-xs text-amber-200">只读</span> : null}{folder.pending_write ? <span className="rounded bg-cyan-300/10 px-2 py-0.5 text-xs text-cyan-100">待写回</span> : null}</div><p className="mt-1 text-xs text-slate-500">{folder.creator || "未署名"} · {folder.entries.length} 个难度</p></div><div className="flex gap-1"><Button disabled={busy} onClick={() => void exportShare()} size="icon" title="导出分享码" variant="ghost"><FileOutput className="size-4" /></Button><Button disabled={busy || !folder.entries.some((entry) => entry.beatmapset_id)} onClick={() => void download()} size="icon" title="下载缺失谱面集" variant="ghost"><Download className="size-4" /></Button><Button disabled={busy || folder.read_only} onClick={() => void remove()} size="icon" title="删除收藏夹" variant="ghost"><Trash2 className="size-4" /></Button></div></div><div className="max-h-64 divide-y divide-white/[0.05] overflow-y-auto">{folder.entries.length ? folder.entries.map((entry) => <div className="flex items-center gap-3 px-5 py-3" key={entry.id}><span className={`size-2 rounded-full ${entry.resolved ? "bg-emerald-300" : "bg-amber-300"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-200">{entry.title} <span className="text-slate-500">[{entry.difficulty_name}]</span></p><p className="truncate text-xs text-slate-600">{entry.artist} · {entry.creator}{entry.beatmapset_id ? ` · #${entry.beatmapset_id}` : ""}</p></div>{!folder.read_only ? <Button disabled={busy} onClick={() => void remove(entry.id)} size="icon" variant="ghost"><Trash2 className="size-3.5" /></Button> : null}</div>) : <p className="px-5 py-8 text-center text-sm text-slate-600">还没有谱面</p>}</div>{exported ? <div className="border-t border-white/[0.07] p-4"><p className="mb-2 text-xs text-emerald-200">分享码已复制。OPPC2 会紧凑保存在线谱面 ID。</p><textarea className="h-20 w-full rounded-lg border border-white/10 bg-black/20 p-2 font-mono text-[10px] text-slate-400" readOnly value={exported} /></div> : null}{error ? <p className="p-4 text-sm text-rose-200">{error}</p> : null}</Card>;
}

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const collections = useCollections();
  const refresh = useRefreshCollections();
  const [name, setName] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [preview, setPreview] = useState<CollectionSharePreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leavePrompt, setLeavePrompt] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const navigate = useNavigate();
  const hasUnsavedChanges = collections.data?.folders.some((folder) => folder.pending_write) ?? false;

  useEffect(() => {
    const interceptNavigation = (event: MouseEvent) => {
      if (!hasUnsavedChanges || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      const target = anchor?.getAttribute("href");
      if (!anchor || anchor.target || anchor.download || !target?.startsWith("/") || target === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation(target);
      setLeavePrompt(true);
    };
    window.addEventListener("click", interceptNavigation, true);
    return () => window.removeEventListener("click", interceptNavigation, true);
  }, [hasUnsavedChanges]);
  useBeforeUnload((event) => {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = "";
  });

  useEffect(() => {
    if (!collections.data) return;
    let cancelled = false;
    void desktopApi.getCollectionSyncStatus().then((status) => {
      if (cancelled) return;
      if (!status.in_sync) {
        setNotice(status.game_changed ? "游戏收藏夹已变更，点击“刷新 Stable”将从游戏同步。" : "软件收藏夹有待写回的更改。");
      }
      if (status.missing_downloadable_count > 0 && window.confirm(`收藏夹发现 ${status.missing_downloadable_count} 个缺失谱面集，是否由 OPP 批量下载到 osu!stable？`)) {
        void downloadMissingBeatmapsToGame().then((download) => {
          if (download && !cancelled) setNotice(`已补全 ${download.completed} 个缺失谱面。`);
        }).catch((caught: unknown) => {
          if (!cancelled) setNotice((caught as CommandError).message ?? String(caught));
        });
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [collections.data]);

  const changed = () => void queryClient.invalidateQueries({ queryKey: collectionsQueryKey });
  const downloadMissingBeatmapsToGame = async () => {
    const folders = collections.data?.folders ?? [];
    const itemGroups = await Promise.all(folders.map((folder) => desktopApi.getCollectionDownloadItems(folder.id)));
    const items = [...new Map(itemGroups.flat().map((item) => [item.beatmapset_id, item])).values()];
    if (!items.length) return null;

    const stable = (await desktopApi.getLocalSources()).find((source) => source.client === "stable");
    const destination = stable?.install_root;
    if (!stable?.valid || !destination) {
      throw new Error("请先在设置中配置有效的 osu!stable 安装目录，才能将线上谱面自动下载到游戏。");
    }

    const settings = await desktopApi.getSettings();
    return desktopApi.downloadOnlineBeatmapsets({
      destination,
      provider: resolveDefaultDownloadProvider(settings),
      overwrite: false,
      items,
    });
  };
  const create = async () => { if (!name.trim()) return; setBusy(true); try { await desktopApi.createCollection(name.trim(), ""); setName(""); changed(); } finally { setBusy(false); } };
  const importShare = async () => { setBusy(true); try { setPreview(await desktopApi.previewCollectionShare(shareCode)); } catch (caught) { setNotice((caught as CommandError).message ?? String(caught)); } finally { setBusy(false); } };
  const confirmImport = async () => { setBusy(true); try { const imported = await desktopApi.importCollectionShare(shareCode); setNotice(`已导入“${imported.name}”，包含 ${imported.entries.length} 个难度。`); setShareCode(""); setPreview(null); changed(); } catch (caught) { setNotice((caught as CommandError).message ?? String(caught)); } finally { setBusy(false); } };
  const write = async () => { setBusy(true); try { const result = await desktopApi.writeStableCollections(); setNotice(`已写回 ${result.written_folders} 个收藏夹${result.skipped_entries ? `；${result.skipped_entries} 个未取得 MD5 的条目未写入游戏。` : "。"}`); changed(); return true; } catch (caught) { setNotice((caught as CommandError).message ?? String(caught)); return false; } finally { setBusy(false); } };
  const writeWithAutoDownload = async () => {
    setBusy(true);
    try {
      const download = await downloadMissingBeatmapsToGame();
      const written = await write();
      if (!written) return false;
      if (download) {
        setNotice(`已将 ${download.completed} 个缺失谱面下载到 osu!stable${download.failed ? `，${download.failed} 个下载失败` : ""}。尚未被游戏导入的谱面会在下次启动 osu!stable 后可再次写回收藏夹。`);
      }
      return true;
    } catch (caught) {
      setNotice((caught as CommandError).message ?? String(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const completeLeave = () => { const target = pendingNavigation; setLeavePrompt(false); setPendingNavigation(null); if (target) navigate(target); };
  const saveAndLeave = async () => { if (await writeWithAutoDownload()) completeLeave(); };
  const discardAndLeave = completeLeave;
  const stay = () => { setLeavePrompt(false); setPendingNavigation(null); };

  return <><PageHeader title="谱面收藏夹" description="统一管理游戏收藏夹与 OPP 分享图包；Stable 支持安全写回，lazer 当前只读。" actions={<div className="flex gap-2"><Button disabled={busy} onClick={() => void refresh("stable")} size="sm" variant="secondary"><RefreshCw className="size-3.5" />刷新 Stable</Button><Button disabled={busy} onClick={() => void writeWithAutoDownload()} size="sm"><Save className="size-3.5" />写回游戏</Button></div>} /><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="space-y-4">{collections.isLoading ? <p className="text-sm text-slate-500">正在读取收藏夹…</p> : collections.data?.folders.length ? collections.data.folders.map((folder) => <FolderCard folder={folder} key={folder.id} onChanged={changed} />) : <EmptyState icon={<Heart className="size-6" />} title="还没有收藏夹" description="从在线、本地或相似谱面页将难度加入收藏夹，或在右侧创建一个。" />}</section><aside className="space-y-4"><Card className="p-5"><h2 className="text-sm font-semibold text-white">新建收藏夹</h2><input className="opp-input mt-3" onChange={(event) => setName(event.target.value)} placeholder="收藏夹名称" value={name} /><Button className="mt-3 w-full" disabled={busy || !name.trim()} onClick={() => void create()}><FolderPlus className="size-4" />创建</Button></Card><Card className="p-5"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><FileInput className="size-4 text-cyan-200" />导入分享码</h2><textarea className="mt-3 h-28 w-full rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs text-slate-300" onChange={(event) => { setShareCode(event.target.value); setPreview(null); }} placeholder="粘贴 OPPC2.… 分享码" value={shareCode} /><Button className="mt-3 w-full" disabled={busy || !shareCode.trim()} onClick={() => void importShare()} variant="secondary">解析分享码</Button></Card><Card className="p-5"><h2 className="text-sm font-semibold text-white">游戏来源</h2>{collections.data?.sources.map((source) => <div className="mt-3 border-t border-white/[0.06] pt-3" key={source.client}><p className="text-sm text-slate-200">osu! {source.client}{source.read_only ? " · 只读" : ""}</p><p className="mt-1 text-xs leading-5 text-slate-500">{source.message}</p></div>)}</Card>{notice ? <p className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4 text-sm text-cyan-100">{notice}</p> : null}</aside></div><ImportPreviewDialog busy={busy} onCancel={() => setPreview(null)} onConfirm={() => void confirmImport()} preview={preview} />{leavePrompt ? <div className="fixed inset-0 z-[280] grid place-items-center bg-black/70 p-5 backdrop-blur-sm"><Card className="w-full max-w-md p-6 shadow-2xl"><h2 className="text-lg font-semibold text-white">收藏夹尚未写回游戏</h2><p className="mt-2 text-sm leading-6 text-slate-400">你对收藏夹做了修改。离开前是否保存到 osu!stable？</p><div className="mt-6 flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={stay} variant="ghost">留在此页</Button><Button disabled={busy} onClick={discardAndLeave} variant="secondary">不保存并离开</Button><Button loading={busy} onClick={() => void saveAndLeave()}><Save className="size-4" />保存并离开</Button></div></Card></div> : null}</>;
}
