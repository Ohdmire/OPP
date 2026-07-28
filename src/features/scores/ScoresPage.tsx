import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import {
  BarChart3,
  CalendarDays,
  ExternalLink,
  Gamepad2,
  Hash,
  Layers3,
  RefreshCw,
  Search,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useMode } from "../../app/ModeContext";
import { ErrorPanel } from "../../shared/components/ErrorPanel";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  Badge,
  Button,
  Card,
  DataLine,
  EmptyState,
  Skeleton,
} from "../../shared/components/ui";
import { desktopApi } from "../../shared/lib/tauri";
import {
  dateTime,
  fullNumber,
  rankTone,
  scoreMods,
  scoreTotal,
} from "../../shared/lib/format";
import type { Score } from "../../shared/types/osu";
import { useOwnProfile } from "../profile/api";
import { useBestScores } from "./api";

function ScoreSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 7 }, (_, index) => (
        <Skeleton className="h-[92px]" key={index} />
      ))}
    </div>
  );
}

function accuracy(score: Score) {
  return `${(score.accuracy * 100).toFixed(2)}%`;
}

function scoreDate(score: Score) {
  return score.ended_at ?? score.created_at ?? null;
}

function ScoreRow({
  score,
  position,
  onOpen,
}: {
  score: Score;
  position: number;
  onOpen: () => void;
}) {
  const beatmap = score.beatmap;
  const set = score.beatmapset;
  const cover = set?.covers?.list ?? set?.covers?.card;
  const mods = scoreMods(score);

  return (
    <motion.button
      className="group grid w-full grid-cols-[52px_minmax(0,1.7fr)_minmax(180px,.7fr)_100px] items-center gap-4 overflow-hidden rounded-2xl border border-white/[0.065] bg-[#111725]/78 p-3 text-left outline-none transition hover:border-white/[0.13] hover:bg-[#151c2d] focus-visible:ring-2 focus-visible:ring-cyan-300/45"
      onClick={onOpen}
      transition={{ duration: 0.18 }}
      type="button"
      whileHover={{ y: -1 }}
    >
      <div className="text-center font-mono text-xs font-semibold text-slate-600">
        #{position}
      </div>
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
          {cover ? (
            <img alt="" className="size-full object-cover" src={cover} />
          ) : (
            <div className="grid size-full place-items-center">
              <Gamepad2 className="size-5 text-slate-700" />
            </div>
          )}
          <span
            className={`absolute bottom-1 left-1 grid size-7 place-items-center rounded-lg border border-white/10 bg-[#090d16]/90 font-mono text-[11px] font-black ${rankTone(score.rank)}`}
          >
            {score.rank}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {set?.title_unicode || set?.title || "未知谱面"}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {set?.artist_unicode || set?.artist || "未知艺术家"} ·{" "}
            <span className="text-slate-400">[{beatmap?.version ?? "?"}]</span>
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            {mods.length ? (
              mods.map((mod) => (
                <span
                  className="rounded-md bg-cyan-300/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-cyan-100"
                  key={mod}
                >
                  {mod}
                </span>
              ))
            ) : (
              <span className="font-mono text-[9px] text-slate-700">NM</span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-600">Accuracy</p>
          <p className="mt-1 font-mono text-xs font-semibold text-slate-200">
            {accuracy(score)}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-600">Combo</p>
          <p className="mt-1 font-mono text-xs font-semibold text-slate-200">
            {fullNumber(score.max_combo)}x
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-600">Stars</p>
          <p className="mt-1 font-mono text-xs text-slate-400">
            {beatmap?.difficulty_rating?.toFixed(2) ?? "—"}★
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-600">Weight</p>
          <p className="mt-1 font-mono text-xs text-slate-400">
            {score.weight?.percentage?.toFixed(0) ?? "—"}%
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-xl font-semibold text-pink-200">
          {score.pp?.toFixed(2) ?? "—"}
          <span className="ml-1 text-[10px] text-pink-300/50">pp</span>
        </p>
        <p className="mt-2 text-[10px] text-slate-600">{dateTime(scoreDate(score))}</p>
      </div>
    </motion.button>
  );
}

function HitChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-center">
      <p className={`font-mono text-base font-bold ${tone}`}>{fullNumber(value)}</p>
      <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">{label}</p>
    </div>
  );
}

function ScoreDialog({
  score,
  position,
  onClose,
}: {
  score: Score;
  position: number;
  onClose: () => void;
}) {
  const stats = score.statistics ?? {};
  const beatmap = score.beatmap;
  const set = score.beatmapset;
  const cover = set?.covers?.cover ?? set?.covers?.card;
  const hitValues = [
    ["300 / Great", stats.great ?? stats.count_300 ?? 0, "text-cyan-200"],
    ["100 / Ok", stats.ok ?? stats.count_100 ?? 0, "text-emerald-200"],
    ["50 / Meh", stats.meh ?? stats.count_50 ?? 0, "text-amber-200"],
    ["Miss", stats.miss ?? stats.count_miss ?? 0, "text-rose-200"],
  ];

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm data-[state=open]:animate-in" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] max-h-[86vh] w-[760px] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[24px] border border-white/10 bg-[#0e1421] shadow-[0_35px_120px_rgba(0,0,0,.65)] outline-none">
        <div className="relative min-h-48 overflow-hidden p-6">
          {cover ? (
            <img alt="" className="absolute inset-0 size-full object-cover opacity-35" src={cover} />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e1421] via-[#0e1421]/80 to-[#0e1421]/30" />
          <div className="relative flex min-h-36 items-end justify-between gap-6">
            <div className="min-w-0">
              <Badge tone="pink">TOP #{position}</Badge>
              <Dialog.Title className="mt-3 truncate text-2xl font-semibold text-white">
                {set?.title_unicode || set?.title || "未知谱面"}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-slate-300">
                {set?.artist_unicode || set?.artist} · [{beatmap?.version}] · mapped by{" "}
                {set?.creator ?? "unknown"}
              </Dialog.Description>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-3xl font-semibold text-pink-200">
                {score.pp?.toFixed(2) ?? "—"}
                <span className="ml-1 text-xs text-pink-300/50">pp</span>
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">{accuracy(score)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 px-6">
          {hitValues.map(([label, value, tone]) => (
            <HitChip
              key={String(label)}
              label={String(label)}
              tone={String(tone)}
              value={Number(value)}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-5 p-6">
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
              <Trophy className="size-4 text-pink-200" />
              成绩详情
            </div>
            <DataLine label="评价" value={score.rank} />
            <DataLine label="总分" value={fullNumber(scoreTotal(score))} />
            <DataLine label="最大连击" value={`${fullNumber(score.max_combo)}x`} />
            <DataLine
              label="Mods"
              value={scoreMods(score).join(" · ") || "No Mod"}
            />
            <DataLine label="权重" value={`${score.weight?.percentage?.toFixed(2) ?? "—"}%`} />
            <DataLine label="获得时间" value={dateTime(scoreDate(score))} />
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
              <Layers3 className="size-4 text-cyan-200" />
              谱面参数
            </div>
            <DataLine label="星数" value={`${beatmap?.difficulty_rating?.toFixed(2) ?? "—"}★`} />
            <DataLine label="BPM" value={beatmap?.bpm?.toFixed(0) ?? "—"} />
            <DataLine label="AR" value={beatmap?.ar?.toFixed(1) ?? "—"} />
            <DataLine label="OD" value={beatmap?.accuracy?.toFixed(1) ?? "—"} />
            <DataLine label="CS" value={beatmap?.cs?.toFixed(1) ?? "—"} />
            <DataLine label="长度" value={`${beatmap?.total_length ?? "—"} 秒`} />
          </Card>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-4 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Hash className="size-3.5" /> {score.id ?? "legacy"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" /> {dateTime(scoreDate(score))}
            </span>
          </div>
          <div className="flex gap-2">
            {beatmap?.url ? (
              <Button onClick={() => desktopApi.openExternal(beatmap.url!)} size="sm">
                <ExternalLink className="size-3.5" />
                打开谱面
              </Button>
            ) : null}
            {score.id ? (
              <Button
                onClick={() => desktopApi.openExternal(`https://osu.ppy.sh/scores/${score.id}`)}
                size="sm"
                variant="primary"
              >
                查看成绩
              </Button>
            ) : null}
          </div>
        </div>
        <Dialog.Close
          aria-label="关闭"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-xl border border-white/10 bg-black/30 text-slate-300 backdrop-blur-md transition hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <X className="size-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function ScoresPage() {
  const { ruleset } = useMode();
  const profileQuery = useOwnProfile(ruleset);
  const scoresQuery = useBestScores(ruleset, Boolean(profileQuery.data?.data));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ score: Score; position: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const scores = scoresQuery.data?.data ?? [];
    if (!query) return scores.map((score, index) => ({ score, position: index + 1 }));
    return scores
      .map((score, index) => ({ score, position: index + 1 }))
      .filter(({ score }) =>
        [
          score.beatmapset?.title,
          score.beatmapset?.title_unicode,
          score.beatmapset?.artist,
          score.beatmapset?.creator,
          score.beatmap?.version,
          ...scoreMods(score),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(query)),
      );
  }, [scoresQuery.data, search]);
  const searchSuggestions = (scoresQuery.data?.data ?? []).flatMap((score) => [
    score.beatmapset?.title,
    score.beatmapset?.title_unicode,
    score.beatmapset?.artist,
    score.beatmapset?.creator,
    score.beatmap?.version,
    ...scoreMods(score),
  ]).filter((value): value is string => Boolean(value)).map((value) => ({ value }));

  const refresh = async () => {
    setRefreshing(true);
    try {
      await scoresQuery.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <PageHeader
        description="读取全局所选模式的 Top 100，所有筛选均在本地完成。"
        eyebrow="Performance archive"
        title="最佳成绩"
      />

      <Card className="mb-4 flex items-center gap-3 p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-600" />
          <input
            aria-label="搜索成绩"
            className="w-full rounded-xl border border-white/[0.07] bg-black/20 py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索曲名、艺术家、Mapper、难度或 Mod"
            value={search}
            list="score-search-suggestions"
          />
          <datalist id="score-search-suggestions">
            {searchSuggestions.map((suggestion, index) => <option key={`${suggestion.value}-${index}`} value={suggestion.value} />)}
          </datalist>
        </div>
        <div className="flex items-center gap-4 px-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <BarChart3 className="size-3.5 text-pink-200" />
            {filtered.length} / {scoresQuery.data?.data.length ?? 0}
          </span>
        </div>
        <Button loading={refreshing} onClick={refresh} size="icon" title="刷新成绩">
          <RefreshCw className="size-4" />
        </Button>
      </Card>

      {scoresQuery.isLoading || profileQuery.isLoading ? (
        <ScoreSkeleton />
      ) : scoresQuery.error ? (
        <ErrorPanel error={scoresQuery.error} onRetry={() => scoresQuery.refetch()} />
      ) : filtered.length ? (
        <div className="space-y-2.5">
          {filtered.map(({ score, position }) => (
            <ScoreRow
              key={`${score.id ?? "legacy"}-${position}`}
              onOpen={() => setSelected({ score, position })}
              position={position}
              score={score}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={search ? <Search className="size-5" /> : <Zap className="size-5" />}
          title={search ? "没有匹配的成绩" : "当前模式还没有最佳成绩"}
          description={
            search
              ? "尝试更短的曲名、艺术家名称或 Mod 缩写。"
              : "osu! API v2 返回了一个空列表；切换其他模式也许能找到记录。"
          }
        />
      )}

      <Dialog.Root onOpenChange={(open) => !open && setSelected(null)} open={Boolean(selected)}>
        {selected ? (
          <ScoreDialog
            onClose={() => setSelected(null)}
            position={selected.position}
            score={selected.score}
          />
        ) : null}
      </Dialog.Root>
    </>
  );
}
