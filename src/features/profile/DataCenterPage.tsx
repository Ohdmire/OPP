import { useEffect } from "react";
import { BarChart3, Database, Pin, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../../shared/components/PageHeader";
import { Card } from "../../shared/components/ui";
import { ScoresPage } from "../scores/ScoresPage";
import { OverviewPage } from "./OverviewPage";
import { ProfileDetailsPage } from "./ProfileDetailsPage";

const sections = [
  ["overview", "概览", Database],
  ["scores", "BP 1–100", BarChart3],
  ["bp-101-200", "BP 101–200", BarChart3],
  ["pinned", "Pinned", Pin],
  ["profile", "详细档案", UserRound],
] as const;

export function DataCenterPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <>
      <PageHeader title="数据中心" />
      <Card className="mb-7 flex flex-wrap gap-1.5 p-2">
        {sections.map(([id, label, Icon]) => (
          <Link className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)]" to={`/data#${id}`} key={id}>
            <Icon className="size-3.5" />{label}
          </Link>
        ))}
      </Card>
      <div className="space-y-12">
        <section className="scroll-mt-[124px]" id="overview"><OverviewPage /></section>
        <section className="scroll-mt-[124px]" id="scores"><ScoresPage embedded title="最佳成绩 · BP 1–100" /></section>
        <section className="scroll-mt-[124px]" id="bp-101-200"><ScoresPage embedded offset={100} title="BP 101–200" /></section>
        <section className="scroll-mt-[124px]" id="pinned"><ScoresPage category="pinned" embedded title="Pinned 成绩" /></section>
        <section className="scroll-mt-[124px]" id="profile"><ProfileDetailsPage /></section>
      </div>
    </>
  );
}
