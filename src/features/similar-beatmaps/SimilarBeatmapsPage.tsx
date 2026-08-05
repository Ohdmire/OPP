import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FolderOpen, History, RefreshCw, Search, Trophy, Upload } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../shared/components/PageHeader";
import { Button, Card, EmptyState } from "../../shared/components/ui";
import { errorMessage } from "../../shared/lib/format";
import { settingsQueryKey, useSettings } from "../settings/api";
import { desktopApi } from "../../shared/lib/tauri";
import type {
  SimilarityBaseFeatures,
  SimilarityFilters,
  SimilarityIndexStatus,
  SimilarityQueryRequest,
  SimilarityQueryResponse,
  SimilarityRecommendationKind,
  SimilarityRecommendationResponse,
  SimilarityResult,
} from "../../shared/types/osu";
import {
  similarityIndexStatusKey,
  useSimilarityIndexStatus,
  useSimilarityQuery,
  useSimilarityRecommendation,
} from "./api";
import { createSimilarityRequest, defaultSimilarityFilters } from "./defaults";
import { SimilarityAdvancedPanel } from "./SimilarityAdvancedPanel";
import { SimilarityFilterSliders } from "./SimilarityFilterSliders";
import { SimilarityRadar } from "./SimilarityRadar";
import { SimilarityResultCard } from "./SimilarityResultCard";
import {
  onlineBeatmapRouteForSimilarityResult,
  parseSimilarityLaunch,
} from "./navigation";
import { normalizePreviewUrl } from "../online-beatmaps/filters";

const DIFFICULTY_DIMENSIONS = [
  ["aim", "Aim"],
  ["speed", "Speed"],
  ["reading", "Reading"],
  ["slider", "Slider"],
  ["overlap", "Overlap"],
] as const;

function matchesCandidateFilters(
  base: SimilarityBaseFeatures,
  difficulty: { aim: number; speed: number },
  filters: SimilarityFilters,
) {
  // The private similarity index does not retain an official star field. Use
  // the existing normalized aim/speed dimensions for a stable local estimate.
  const star = Math.hypot(difficulty.aim, difficulty.speed) * 5;
  return (
    (filters.min_star == null || star >= filters.min_star) &&
    (filters.max_star == null || star <= filters.max_star) &&
    (filters.min_ar == null || base.ar >= filters.min_ar) &&
    (filters.max_ar == null || base.ar <= filters.max_ar) &&
    (filters.min_cs == null || base.cs >= filters.min_cs) &&
    (filters.max_cs == null || base.cs <= filters.max_cs) &&
    (filters.min_od == null || base.od >= filters.min_od) &&
    (filters.max_od == null || base.od <= filters.max_od) &&
    (filters.min_bpm == null || base.bpm >= filters.min_bpm) &&
    (filters.max_bpm == null || base.bpm <= filters.max_bpm) &&
    (filters.min_length_seconds == null || base.length_seconds >= filters.min_length_seconds) &&
    (filters.max_length_seconds == null || base.length_seconds <= filters.max_length_seconds) &&
    (filters.min_object_density == null || base.object_density >= filters.min_object_density) &&
    (filters.max_object_density == null || base.object_density <= filters.max_object_density) &&
    (filters.min_circle_ratio == null || base.circle_ratio >= filters.min_circle_ratio) &&
    (filters.max_circle_ratio == null || base.circle_ratio <= filters.max_circle_ratio) &&
    (filters.min_slider_ratio == null || base.slider_ratio >= filters.min_slider_ratio) &&
    (filters.max_slider_ratio == null || base.slider_ratio <= filters.max_slider_ratio)
  );
}

interface SimilaritySession {
  request: SimilarityQueryRequest;
  response: SimilarityQueryResponse | null;
  recommendationResponse: SimilarityRecommendationResponse | null;
  selectedResultId: number | null;
  advancedOpen: boolean;
  scrollY: number | null;
}

let similaritySession: SimilaritySession | null = null;

function saveSimilaritySession(session: SimilaritySession) {
  similaritySession = session;
}

const STATE_COPY: Record<
  Exclude<SimilarityIndexStatus["state"], "ready">,
  { title: string; description: string }
> = {
  unconfigured: {
    title: "本地索引未配置",
    description:
      "请选择一个兼容的本地索引目录。相似谱面功能只会在本机以只读方式使用该目录。",
  },
  missing: {
    title: "本地索引目录不可用",
    description: "此前选择的目录已移动或删除，请重新选择目录或重新校验。",
  },
  invalid: {
    title: "本地索引校验失败",
    description: "目录中的必要文件缺失、校验值不一致，或索引内容已损坏。",
  },
  incompatible: {
    title: "本地索引版本不兼容",
    description: "该索引使用的分析器、归一化器或索引格式与当前版本不兼容。",
  },
};

function formatMetric(value: number | null, digits = 2) {
  return value == null ? "—" : value.toFixed(digits);
}

function formatDataCutoff(value: number | null) {
  if (value == null) return "索引未声明数据截止时间";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value * 1000));
}

function IndexUnavailable({
  status,
  busy,
  onChoose,
  onRetry,
}: {
  status: SimilarityIndexStatus;
  busy: boolean;
  onChoose: () => void;
  onRetry: () => void;
}) {
  const copy = STATE_COPY[status.state as Exclude<SimilarityIndexStatus["state"], "ready">];

  return (
    <EmptyState
      action={
        <div className="flex justify-center gap-2">
          <Button type="button" variant="primary" onClick={onChoose} disabled={busy}>
            <FolderOpen size={16} aria-hidden="true" />
            选择索引目录
          </Button>
          <Button type="button" onClick={onRetry} disabled={busy}>
            <RefreshCw size={16} aria-hidden="true" />
            重新校验
          </Button>
        </div>
      }
      description={`${copy.description}${status.message ? ` ${status.message}` : ""}`}
      icon={<FolderOpen size={22} aria-hidden="true" />}
      title={copy.title}
    />
  );
}

export function SimilarBeatmapsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const statusQuery = useSimilarityIndexStatus();
  const similarityQuery = useSimilarityQuery();
  const similarityRecommendation = useSimilarityRecommendation();
  const settings = useSettings();
  const [request, setRequest] = useState<SimilarityQueryRequest>(() =>
    similaritySession?.request ?? createSimilarityRequest({ kind: "beatmap_id", value: "" }),
  );
  const [advancedOpen, setAdvancedOpen] = useState(() => similaritySession?.advancedOpen ?? false);
  const [configuring, setConfiguring] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [quickDownloadId, setQuickDownloadId] = useState<number | null>(null);
  const [quickDownloadDirectory, setQuickDownloadDirectory] = useState<string | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<number | null>(null);
  const [response, setResponse] = useState<SimilarityQueryResponse | null>(
    () => similaritySession?.response ?? null,
  );
  const [recommendationResponse, setRecommendationResponse] =
    useState<SimilarityRecommendationResponse | null>(
      () => similaritySession?.recommendationResponse ?? null,
    );
  const [selectedResultId, setSelectedResultId] = useState<number | null>(
    () => similaritySession?.selectedResultId ?? null,
  );
  const handledLaunch = useRef<string | null>(null);
  const restoreScrollY = useRef(similaritySession?.scrollY ?? null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewVolume = settings.data?.preview_volume ?? 65;

  const filteredResults = useMemo(
    () => (recommendationResponse?.results ?? response?.results ?? []).filter(
      (result) => matchesCandidateFilters(result.base, result.difficulty, request.filters),
    ),
    [recommendationResponse, request.filters, response],
  );

  const selected = useMemo(() => {
    if (!filteredResults.length) return null;
    if (!selectedResultId) return filteredResults[0];
    return (
      filteredResults.find(
        (result) => result.beatmap_id === selectedResultId,
      ) ?? filteredResults[0]
    );
  }, [filteredResults, selectedResultId]);
  const recommendedBy = selected
    ? recommendationResponse?.results.find(
        (result) => result.beatmap_id === selected.beatmap_id,
      )?.recommended_by ?? null
    : null;
  const comparisonTarget = recommendedBy ?? response?.target ?? null;

  const status =
    statusQuery.data ??
    ({
      state: "unconfigured",
      directory: null,
      record_count: null,
      analyzer_version: null,
      normalization_version: null,
      algorithm_id: null,
      data_cutoff_at: null,
      message: statusQuery.error ? errorMessage(statusQuery.error) : "",
    } satisfies SimilarityIndexStatus);

  useEffect(() => {
    saveSimilaritySession({
      request,
      response,
      recommendationResponse,
      selectedResultId,
      advancedOpen,
      scrollY: restoreScrollY.current,
    });
  }, [advancedOpen, recommendationResponse, request, response, selectedResultId]);

  useLayoutEffect(() => {
    const scrollY = restoreScrollY.current;
    if (scrollY == null) return;
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = previewVolume / 100;
  }, [previewVolume]);

  useEffect(() => {
    const launch = parseSimilarityLaunch(searchParams);
    const launchKey = searchParams.toString();
    if (!launch || status.state !== "ready" || handledLaunch.current === launchKey) return;
    handledLaunch.current = launchKey;

    const run = async () => {
      const source =
        launch.kind === "beatmap_id"
          ? { kind: "beatmap_id" as const, value: launch.beatmapId }
          : {
              kind: "local_file" as const,
              path: await desktopApi.getLocalBeatmapPath(launch.client, launch.resourceId),
            };
      const nextRequest = createSimilarityRequest(source);
      setRequest(nextRequest);
      setResponse(null);
      setRecommendationResponse(null);
      setSelectedResultId(null);
      similarityQuery.mutate(nextRequest, { onSuccess: setResponse });
      setSearchParams(new URLSearchParams(), { replace: true });
    };
    void run().catch((error) => setConfigurationError(errorMessage(error)));
  }, [searchParams, setSearchParams, similarityQuery, status.state]);

  async function chooseIndexDirectory() {
    setConfigurationError(null);
    const selectedDirectory = await desktopApi.chooseDirectory(
      "选择相似谱面索引目录",
      statusQuery.data?.directory ?? undefined,
    );
    if (!selectedDirectory) return;

    setConfiguring(true);
    try {
      const status = await desktopApi.configureSimilarityIndex(selectedDirectory);
      queryClient.setQueryData(similarityIndexStatusKey, status);
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      similarityQuery.reset();
      similarityRecommendation.reset();
      setResponse(null);
      setRecommendationResponse(null);
      setSelectedResultId(null);
    } catch (error) {
      setConfigurationError(errorMessage(error));
    } finally {
      setConfiguring(false);
    }
  }

  function switchSource(kind: "beatmap_id" | "local_file") {
    similarityQuery.reset();
    similarityRecommendation.reset();
    setResponse(null);
    setRecommendationResponse(null);
    setSelectedResultId(null);
    setRequest((current) => ({
      ...current,
      source:
        kind === "beatmap_id"
          ? { kind: "beatmap_id", value: "" }
          : { kind: "local_file", path: "" },
    }));
  }

  async function chooseOsuFile() {
    const path = await desktopApi.chooseSimilarityBeatmapFile();
    if (!path) return;
    setRequest((current) => ({
      ...current,
      source: { kind: "local_file", path },
    }));
  }

  async function downloadResults(results: SimilarityResult[]) {
    if (!results.length) return;
    let destination =
      quickDownloadDirectory ?? settings.data?.beatmap_download_directory ?? "";
    if (!destination) {
      destination = await desktopApi.chooseBeatmapDownloadDirectory(null) ?? "";
      if (!destination) return;
      setQuickDownloadDirectory(destination);
      if (settings.data) {
        const saved = await desktopApi.updateSettings({
          ...settings.data,
          beatmap_download_directory: destination,
        });
        queryClient.setQueryData(settingsQueryKey, saved);
      }
    }

    setConfigurationError(null);
    setDownloadNotice(null);
    setQuickDownloadId(results.length === 1 ? results[0].beatmap_id : -1);
    try {
      const downloaded = await desktopApi.downloadOnlineBeatmapsets({
        destination,
        provider: "catboy",
        overwrite: false,
        items: Array.from(new Map(results.map((result) => [result.beatmapset_id, { beatmapset_id: result.beatmapset_id, artist: result.artist, title: result.title }])).values()),
      });
      setDownloadNotice(
        downloaded.completed > 0
          ? `已下载 ${downloaded.completed} 个谱面集到：${downloaded.destination}`
          : `下载已处理；保存位置：${downloaded.destination}`,
      );
    } catch (error) {
      setConfigurationError(errorMessage(error));
    } finally {
      setQuickDownloadId(null);
    }
  }

  async function downloadResult(result: SimilarityResult) {
    await downloadResults([result]);
  }

  function openOnlineBeatmap(result: SimilarityResult) {
    saveSimilaritySession({
      request,
      response,
      recommendationResponse,
      selectedResultId,
      advancedOpen,
      scrollY: window.scrollY || null,
    });
    navigate(onlineBeatmapRouteForSimilarityResult(result), {
      state: { returnTo: "/online/similar" },
    });
  }

  async function togglePreview(result: SimilarityResult) {
    if (playingId === result.beatmap_id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }

    setPreviewLoadingId(result.beatmap_id);
    try {
      const beatmapset = await desktopApi.getOnlineBeatmapset(result.beatmapset_id);
      const source = normalizePreviewUrl(beatmapset.preview_url);
      if (!source) return;
      audioRef.current?.pause();
      const audio = new Audio(source);
      audio.volume = previewVolume / 100;
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(result.beatmap_id);
      await audio.play();
    } catch (error) {
      setConfigurationError(errorMessage(error));
      audioRef.current = null;
      setPlayingId(null);
    } finally {
      setPreviewLoadingId(null);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value =
      request.source.kind === "beatmap_id"
        ? request.source.value.trim()
        : request.source.path.trim();
    if (!value) return;
    setSelectedResultId(null);
    setResponse(null);
    setRecommendationResponse(null);
    similarityRecommendation.reset();
    similarityQuery.mutate({
      ...request,
      filters: { ...defaultSimilarityFilters },
      source:
        request.source.kind === "beatmap_id"
          ? { kind: "beatmap_id", value }
          : { kind: "local_file", path: value },
    }, { onSuccess: setResponse });
  }

  function recommend(kind: SimilarityRecommendationKind) {
    setConfigurationError(null);
    setSelectedResultId(null);
    setResponse(null);
    setRecommendationResponse(null);
    similarityQuery.reset();
    similarityRecommendation.mutate(
      {
        kind,
        difficulty_weights: request.difficulty_weights,
        base_weights: request.base_weights,
        filters: { ...defaultSimilarityFilters },
        result_limit: request.result_limit,
      },
      { onSuccess: setRecommendationResponse },
    );
  }

  if (statusQuery.isLoading) {
    return (
      <>
        <PageHeader title="相似谱面" description="从本地私有索引中寻找特征相近的 osu!standard 谱面。" />
        <EmptyState
          description="正在以只读方式检查本机配置。"
          icon={<RefreshCw className="animate-spin" size={22} aria-hidden="true" />}
          title="正在校验本地索引"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="相似谱面"
        description="以谱面难度特征为参照，从你选择的本地私有索引中寻找相近谱面。索引及查询内容不会上传。"
      />

      {configurationError ? (
        <div className="mb-5 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {configurationError}
        </div>
      ) : null}

      {downloadNotice ? (
        <div className="mb-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
          {downloadNotice}
        </div>
      ) : null}

      {status.state !== "ready" ? (
        <IndexUnavailable
          status={status}
          busy={configuring || statusQuery.isFetching}
          onChoose={() => void chooseIndexDirectory()}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : (
        <>
          <Card className="mb-5 flex items-center justify-between gap-5 p-5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                本地索引
              </span>
              <h2 className="mt-1 text-base font-semibold text-white">索引已就绪</h2>
              <p className="mt-1 text-xs text-slate-400">
                {status.record_count == null
                  ? "已通过本机校验"
                  : `已从本机读取 ${status.record_count.toLocaleString()} 条记录`}
                {status.analyzer_version == null
                  ? ""
                  : ` · Analyzer v${status.analyzer_version}`}
              </p>
              <p className="mt-1 text-xs text-amber-200/90">
                数据截止：{formatDataCutoff(status.data_cutoff_at)}
                {status.data_cutoff_at == null ? "" : "（UTC，非实时数据库）"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => void statusQuery.refetch()}
                disabled={statusQuery.isFetching}
              >
                <RefreshCw size={16} aria-hidden="true" />
                重新校验
              </Button>
              <Button
                type="button"
                onClick={() => void chooseIndexDirectory()}
                disabled={configuring}
              >
                <FolderOpen size={16} aria-hidden="true" />
                更换目录
              </Button>
            </div>
          </Card>

          <Card className="mb-5 p-5">
          <div className="mb-5 border-b border-white/[0.07] pb-5">
            <div className="mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-primary)]">为你推荐</span>
              <p className="mt-1 text-xs text-slate-400">从最近通过或 BP 前 20 张谱面出发，按总距离寻找最接近的谱面。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={similarityQuery.isPending || similarityRecommendation.isPending}
                loading={similarityRecommendation.isPending && similarityRecommendation.variables?.kind === "recent"}
                onClick={() => recommend("recent")}
              >
                <History size={16} aria-hidden="true" />
                根据最近游玩推荐
              </Button>
              <Button
                type="button"
                disabled={similarityQuery.isPending || similarityRecommendation.isPending}
                loading={similarityRecommendation.isPending && similarityRecommendation.variables?.kind === "best"}
                onClick={() => recommend("best")}
              >
                <Trophy size={16} aria-hidden="true" />
                根据你的 BP 推荐
              </Button>
            </div>
          </div>
          <form onSubmit={submit}>
            <div className="mb-5 inline-flex rounded-lg border border-white/[0.08] bg-black/15 p-1" role="tablist" aria-label="参考谱面输入方式">
              <Button
                type="button"
                role="tab"
                aria-selected={request.source.kind === "beatmap_id"}
                size="sm"
                variant={request.source.kind === "beatmap_id" ? "primary" : "ghost"}
                onClick={() => switchSource("beatmap_id")}
              >
                ID / 链接
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={request.source.kind === "local_file"}
                size="sm"
                variant={request.source.kind === "local_file" ? "primary" : "ghost"}
                onClick={() => switchSource("local_file")}
              >
                本地 .osu
              </Button>
            </div>

            <div className="flex items-end gap-3">
              <label className="min-w-0 flex-1 text-xs text-slate-400">
                <span className="mb-1.5 block">
                  {request.source.kind === "beatmap_id"
                    ? "Beatmap ID 或 osu! 链接"
                    : "osu!standard 谱面文件"}
                </span>
                <input
                  className="opp-input"
                  value={
                    request.source.kind === "beatmap_id"
                      ? request.source.value
                      : request.source.path
                  }
                  placeholder={
                    request.source.kind === "beatmap_id"
                      ? "例如 1234567 或 https://osu.ppy.sh/beatmaps/1234567"
                      : "选择一个不超过 16 MiB 的 .osu 文件"
                  }
                  readOnly={request.source.kind === "local_file"}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRequest((current) => ({
                      ...current,
                      source: { kind: "beatmap_id", value },
                    }));
                  }}
                />
              </label>
              {request.source.kind === "local_file" ? (
                <Button type="button" onClick={() => void chooseOsuFile()}>
                  <Upload size={16} aria-hidden="true" />
                  选择文件
                </Button>
              ) : null}
              <Button
                variant="primary"
                type="submit"
                disabled={
                  !(request.source.kind === "beatmap_id"
                    ? request.source.value
                    : request.source.path
                  ).trim() || similarityQuery.isPending || similarityRecommendation.isPending
                }
              >
                <Search size={16} aria-hidden="true" />
                {similarityQuery.isPending ? "检索中…" : "查找相似谱面"}
              </Button>
            </div>

            <Button
              className="mt-3"
              size="sm"
              variant="ghost"
              type="button"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen ? "收起高级参数" : "展开高级参数"}
            </Button>

            {advancedOpen ? (
              <SimilarityAdvancedPanel request={request} onChange={setRequest} />
            ) : null}
          </form>
          </Card>

          <SimilarityFilterSliders request={request} onChange={setRequest} />

          {similarityQuery.error || similarityRecommendation.error ? (
            <div className="mb-5 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage(similarityQuery.error ?? similarityRecommendation.error)}
            </div>
          ) : null}

          {response || recommendationResponse ? (
            <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0">
                {recommendationResponse ? (
                  <Card className="mb-5 p-5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-primary)]">个性化推荐</span>
                    <h2 className="mt-2 text-lg font-semibold text-white">
                      {recommendationResponse.kind === "recent" ? "根据最近游玩生成" : "根据你的 BP 生成"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      已使用 {recommendationResponse.seed_count} 张参考谱面
                      {recommendationResponse.skipped_seed_count
                        ? `，跳过 ${recommendationResponse.skipped_seed_count} 张无法读取的谱面`
                        : ""}
                    </p>
                  </Card>
                ) : response ? (
                  <Card className="mb-5 grid items-center gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_320px]">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-primary)]">参考谱面</span>
                      <h2 className="mt-2 text-lg font-semibold text-white">{response.target.version || "本地谱面"}</h2>
                      <p className="mt-1 text-sm text-slate-400">
                        {response.target.artist} — {response.target.title}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                        <span>AR {formatMetric(response.target.base.ar, 1)}</span>
                        <span>BPM {formatMetric(response.target.base.bpm, 0)}</span>
                        <span>长度 {formatMetric(response.target.base.length_seconds, 0)}s</span>
                      </div>
                    </div>
                    <SimilarityRadar target={response.target.difficulty} />
                  </Card>
                ) : null}

                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">推荐结果</span>
                    <h2 className="mt-1 text-base font-semibold text-white">{filteredResults.length} 个相似谱面集</h2>
                  </div>
                  <span className="text-xs text-slate-500">距离越低越相似</span>
                  <Button disabled={!filteredResults.length || quickDownloadId !== null} loading={quickDownloadId === -1} onClick={() => void downloadResults(filteredResults)} size="sm" variant="primary"><Download className="size-3.5" />批量下载当前结果</Button>
                </div>

                {filteredResults.length ? (
                  <div className="space-y-3">
                    {filteredResults.map((result) => (
                      <SimilarityResultCard
                        key={result.beatmap_id}
                        result={result}
                        recommendedBy={recommendationResponse?.results.find((item) => item.beatmap_id === result.beatmap_id)?.recommended_by}
                        selected={selected?.beatmap_id === result.beatmap_id}
                        onSelect={() => setSelectedResultId(result.beatmap_id)}
                        onDownload={() => void downloadResult(result)}
                        downloading={quickDownloadId === result.beatmap_id}
                        downloadDisabled={quickDownloadId !== null}
                        onOpen={() => openOnlineBeatmap(result)}
                        onPreview={() => void togglePreview(result)}
                        playing={playingId === result.beatmap_id}
                        previewLoading={previewLoadingId === result.beatmap_id}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="没有符合当前条件的谱面"
                    description="可以放宽 AR、BPM 范围，或调整高级权重后重试。"
                  />
                )}
              </div>

              {selected && comparisonTarget ? (
                <aside className="sticky top-[120px] self-start">
                <Card className="max-h-[calc(100vh-140px)] overflow-y-auto p-5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-primary)]">特征对比</span>
                  <h2 className="mt-2 text-base font-semibold text-white">{selected.version}</h2>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {selected.artist} — {selected.title}
                  </p>
                  {recommendedBy ? (
                    <p className="mt-2 text-xs text-cyan-200">
                      由 {recommendedBy.artist} - {recommendedBy.title} [{recommendedBy.version}] 推荐
                    </p>
                  ) : null}
                  <SimilarityRadar
                    target={comparisonTarget.difficulty}
                    comparison={selected.difficulty}
                  />
                  <div className="mb-4 space-y-1.5">
                    {DIFFICULTY_DIMENSIONS.map(([key, label]) => {
                      const difference =
                        selected.difficulty[key] - comparisonTarget.difficulty[key];
                      return (
                        <div
                          className="flex items-center justify-between border-b border-white/[0.055] py-1.5 text-xs last:border-b-0"
                          key={key}
                        >
                          <span className="text-slate-400">{label}</span>
                          <span className="font-mono text-slate-200">
                            {selected.difficulty[key].toFixed(3)}
                            <small
                              className={
                                difference === 0
                                  ? "ml-2 text-slate-500"
                                  : difference > 0
                                    ? "ml-2 text-rose-300"
                                    : "ml-2 text-emerald-300"
                              }
                            >
                              {difference >= 0 ? "+" : ""}
                              {difference.toFixed(3)}
                            </small>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mb-5 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-white/[0.07] bg-black/10 p-3">
                      <span className="block text-[10px] text-slate-500">最终距离</span>
                      <strong className="mt-1 block font-mono text-sm text-white">{selected.final_distance.toFixed(4)}</strong>
                    </div>
                    <div className="rounded-lg border border-white/[0.07] bg-black/10 p-3">
                      <span className="block text-[10px] text-slate-500">难度距离</span>
                      <strong className="mt-1 block font-mono text-sm text-white">{selected.difficulty_distance.toFixed(4)}</strong>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    variant="primary"
                    type="button"
                    onClick={() => openOnlineBeatmap(selected)}
                  >
                    在在线谱面中查看
                  </Button>
                </Card>
                </aside>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
