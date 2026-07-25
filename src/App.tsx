import { lazy, Suspense, useEffect } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { AppShell } from "./app/AppShell";
import { ModeProvider } from "./app/ModeContext";
import { AuthSetup } from "./features/auth/AuthSetup";
import { useAuthStatus } from "./features/auth/api";
import { useSettings } from "./features/settings/api";
import { ErrorPanel } from "./shared/components/ErrorPanel";
import { TitleBar } from "./shared/components/TitleBar";

const OverviewPage = lazy(() =>
  import("./features/profile/OverviewPage").then((module) => ({
    default: module.OverviewPage,
  })),
);
const ProfileDetailsPage = lazy(() =>
  import("./features/profile/ProfileDetailsPage").then((module) => ({
    default: module.ProfileDetailsPage,
  })),
);
const ScoresPage = lazy(() =>
  import("./features/scores/ScoresPage").then((module) => ({
    default: module.ScoresPage,
  })),
);
const OnlineBeatmapsPage = lazy(() =>
  import("./features/online-beatmaps/OnlineBeatmapsPage").then((module) => ({
    default: module.OnlineBeatmapsPage,
  })),
);
const LocalAnalysisPage = lazy(() =>
  import("./features/local-analysis/LocalAnalysisPage").then((module) => ({
    default: module.LocalAnalysisPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./features/settings/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);

function Splash() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full border-[3px] border-pink-300 text-sm font-black text-pink-100 shadow-[0_0_55px_rgba(255,106,167,.28)]">
          O
        </div>
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="size-4 animate-spin text-cyan-200" />
          正在打开个人分析空间
        </div>
      </div>
    </main>
  );
}

function ConnectedApp() {
  const settings = useSettings();
  useEffect(() => {
    document.documentElement.classList.toggle(
      "reduce-motion",
      settings.data?.reduce_motion ?? false,
    );
  }, [settings.data?.reduce_motion]);

  return (
    <ModeProvider>
      <Suspense fallback={<Splash />}>
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
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate replace to="/online/overview" />} />
          </Route>
        </Routes>
      </Suspense>
    </ModeProvider>
  );
}

function AppContent() {
  const auth = useAuthStatus();
  if (auth.isLoading) return <Splash />;
  if (auth.error || !auth.data) {
    return (
      <main className="mx-auto grid min-h-screen max-w-2xl place-items-center px-8">
        <div className="w-full">
          <ErrorPanel error={auth.error} onRetry={() => auth.refetch()} />
        </div>
      </main>
    );
  }
  if (!auth.data.connected) return <AuthSetup status={auth.data} />;
  return <ConnectedApp />;
}

export default function App() {
  return (
    <Tooltip.Provider delayDuration={350}>
      <HashRouter>
        <TitleBar />
        <AppContent />
      </HashRouter>
    </Tooltip.Provider>
  );
}
