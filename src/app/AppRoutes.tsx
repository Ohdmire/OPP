import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { AppLoading } from "./AppLoading";

// Keep feature bundles at the route boundary: the shell becomes interactive
// without eagerly loading charts, local scans, and tooling screens.
const OverviewPage = lazy(() => import("../features/profile/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const ProfileDetailsPage = lazy(() => import("../features/profile/ProfileDetailsPage").then((module) => ({ default: module.ProfileDetailsPage })));
const ScoresPage = lazy(() => import("../features/scores/ScoresPage").then((module) => ({ default: module.ScoresPage })));
const OnlineBeatmapsPage = lazy(() => import("../features/online-beatmaps/OnlineBeatmapsPage").then((module) => ({ default: module.OnlineBeatmapsPage })));
const LocalAnalysisPage = lazy(() => import("../features/local-analysis/LocalAnalysisPage").then((module) => ({ default: module.LocalAnalysisPage })));
const LocalMediaPage = lazy(() => import("../features/local-media/LocalMediaPage").then((module) => ({ default: module.LocalMediaPage })));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const GameSessionPage = lazy(() => import("../features/game/GameSessionPage").then((module) => ({ default: module.GameSessionPage })));
const ToolsPage = lazy(() => import("../features/tools/ToolsPage").then((module) => ({ default: module.ToolsPage })));

export function AppRoutes() {
  return (
    <Suspense fallback={<AppLoading />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate replace to="/online/overview" />} />
          <Route path="/online/overview" element={<OverviewPage />} />
          <Route path="/online/profile" element={<ProfileDetailsPage />} />
          <Route path="/online/scores" element={<ScoresPage />} />
          <Route path="/online/beatmaps" element={<OnlineBeatmapsPage />} />
          <Route path="/local" element={<Navigate replace to="/local/maps" />} />
          <Route path="/local/maps" element={<LocalAnalysisPage section="maps" />} />
          <Route path="/local/skins" element={<LocalAnalysisPage section="skins" />} />
          <Route path="/local/media" element={<Navigate replace to="/local/media/screenshots" />} />
          <Route path="/local/media/screenshots" element={<LocalMediaPage kind="screenshot" />} />
          <Route path="/local/media/replays" element={<LocalMediaPage kind="replay" />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/game" element={<GameSessionPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="*" element={<Navigate replace to="/online/overview" />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
