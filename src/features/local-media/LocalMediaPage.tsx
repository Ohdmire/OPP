import { useCallback, useEffect, useMemo, useState } from "react";
import { Clipboard, FileVideo, FolderSearch, Image, RefreshCw } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useMode } from "../../app/ModeContext";
import { ErrorPanel } from "../../shared/components/ErrorPanel";
import { PageHeader } from "../../shared/components/PageHeader";
import { Badge, Button, Card, EmptyState, SectionTitle } from "../../shared/components/ui";
import { desktopApi } from "../../shared/lib/tauri";
import type { GameMediaItem, GameReplayPayload, GameScreenshotPayload } from "../../shared/types/osu";
import { MediaSubnav } from "./MediaSubnav";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

function formatDate(value: string | null) {
  if (!value) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

type Payload = GameReplayPayload | GameScreenshotPayload;

export function LocalMediaPage({ kind }: { kind: "screenshot" | "replay" }) {
  const { client } = useMode();
  const [items, setItems] = useState<GameMediaItem[]>([]);
  const [selected, setSelected] = useState<GameMediaItem | null>(null);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const read = useCallback(async (item: GameMediaItem) => {
    setSelected(item);
    setPayload(null);
    setNotice(null);
    setLoading(true);
    try {
      setPayload(item.kind === "replay"
        ? await desktopApi.readGameReplay(client, item.path)
        : await desktopApi.readGameScreenshot(client, item.path));
    } catch (value) {
      setError(value);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const filteredItems = useMemo(() => items.filter((item) => item.kind === kind), [items, kind]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await desktopApi.listGameMedia(client);
      const nextItems = next.filter((item) => item.kind === kind);
      const preferred = nextItems[0] ?? null;
      setItems(next);
      setSelected(preferred);
      if (preferred) void read(preferred);
      else setPayload(null);
    } catch (value) {
      setError(value);
      setItems([]);
      setSelected(null);
      setPayload(null);
    }
  }, [client, kind, read]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);

  const copyPath = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.path);
      setNotice("文件路径已复制");
    } catch (value) {
      setError(value);
    }
  };

  const copyImage = async () => {
    if (!payload || !("mime_type" in payload)) return;
    try {
      const response = await fetch(`data:${payload.mime_type};base64,${payload.bytes_base64}`);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [payload.mime_type]: blob })]);
      setNotice("图片已复制到剪贴板");
    } catch (value) {
      setError(value);
    }
  };

  const openExplorer = async () => {
    if (!selected) return;
    try {
      await desktopApi.openMediaInExplorer(client, selected.path);
      setNotice("已在资源管理器中定位文件");
    } catch (value) {
      setError(value);
    }
  };

  return (
    <div className="flex h-[calc(100vh-104px-4rem)] min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow={`Local media · ${client}`}
        title={kind === "screenshot" ? "截图预览" : "回放读取"}
        description={kind === "screenshot" ? "浏览并操作 osu! 游戏截图" : "浏览 osu! 回放文件并查看读取结果"}
        actions={<Button aria-label="刷新媒体" onClick={() => void refresh()} size="icon"><RefreshCw className="size-4" /></Button>}
      />
      <MediaSubnav />
      {error ? <div className="mb-5"><ErrorPanel error={error} onRetry={() => void refresh()} /></div> : null}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(250px,300px)_minmax(0,1fr)] gap-5">
        <Card className="flex min-h-0 flex-col overflow-hidden p-3">
          <div className="flex items-center justify-between px-2 py-2">
            <SectionTitle title={kind === "screenshot" ? "截图列表" : "回放列表"} description={`${filteredItems.length} 个对象`} />
            <Badge tone={kind === "screenshot" ? "cyan" : "pink"}>{client}</Badge>
          </div>
          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredItems.length ? filteredItems.map((item) => (
              <button className={`w-full rounded-xl border p-3 text-left transition ${selected?.path === item.path ? "border-cyan-300/25 bg-cyan-300/[0.08]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"}`} key={item.path} onClick={() => void read(item)} type="button">
                <p className="truncate text-sm font-medium text-slate-200">{fileName(item.path)}</p>
                <p className="mt-1 truncate font-mono text-sm text-slate-500">{item.path}</p>
                <p className="mt-2 text-sm text-slate-400">{formatBytes(item.size)} · {formatDate(item.modified_at)}</p>
              </button>
            )) : <EmptyState title={`暂无${kind === "screenshot" ? "截图" : "回放"}`} description="在 osu! 中生成媒体后点击刷新。" />}
          </div>
        </Card>

        <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden p-6">
          {selected ? <>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-5">
              <div className="min-w-0"><h2 className="truncate text-xl font-semibold text-white">{fileName(selected.path)}</h2><p className="mt-2 truncate font-mono text-sm text-slate-400">{selected.path}</p><p className="mt-1 text-sm text-slate-400">{formatBytes(selected.size)} · {formatDate(selected.modified_at)}</p></div>
              <div className="flex flex-wrap gap-2"><Button onClick={() => void openExplorer()} size="sm"><FolderSearch className="size-4" />资源管理器</Button><Button onClick={() => void copyPath()} size="sm"><Clipboard className="size-4" />复制路径</Button>{kind === "replay" ? <NavLink className="inline-flex min-h-8 items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/10 px-4 text-sm font-medium text-violet-100" to={`/local/media/render?replay=${encodeURIComponent(selected.path)}`}><FileVideo className="size-4" />导出回放</NavLink> : null}{payload && "mime_type" in payload ? <Button onClick={() => void copyImage()} size="sm"><Image className="size-4" />复制图片</Button> : null}</div>
            </div>
            {notice ? <p className="mt-4 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-2 text-xs text-cyan-100">{notice}</p> : null}
            <div className="grid min-h-0 flex-1 place-items-center py-6">
              {loading ? <div className="text-sm text-slate-500">正在读取…</div> : payload && "mime_type" in payload ? <img className="max-h-full max-w-full rounded-xl border border-white/[0.06] object-contain" src={`data:${payload.mime_type};base64,${payload.bytes_base64}`} alt={payload.file_name} /> : payload ? <div className="w-full max-w-2xl rounded-2xl border border-pink-300/15 bg-pink-300/[0.05] p-8"><FileVideo className="size-8 text-pink-200" /><h3 className="mt-4 text-lg font-semibold text-white">回放文件已读取</h3><p className="mt-2 text-sm text-slate-400">{payload.note}</p><p className="mt-4 font-mono text-xs text-slate-600">原始数据大小：{formatBytes(Math.ceil(payload.bytes_base64.length * 0.75))}</p></div> : <div className="text-sm text-slate-500">选择对象以开始预览</div>}
            </div>
          </> : <div className="grid flex-1 place-items-center"><EmptyState title="选择一个对象" description="从左侧列表选择截图或回放，预览将在这里显示。" /></div>}
        </Card>
      </div>
    </div>
  );
}
