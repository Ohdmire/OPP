import { useEffect } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { HashRouter } from "react-router-dom";
import { AppConnectionGate } from "./app/AppConnectionGate";
import { TitleBar } from "./shared/components/TitleBar";
import { useSettings } from "./features/settings/api";

function ThemeController() {
  const settings = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.themePrimary = settings.data?.theme_primary ?? "cyan";
    root.dataset.themeSecondary = settings.data?.theme_secondary ?? "pink";
    root.dataset.themeMode = settings.data?.theme_mode ?? "dark";
  }, [settings.data?.theme_primary, settings.data?.theme_secondary, settings.data?.theme_mode]);
  return null;
}

export default function App() {
  return (
    <Tooltip.Provider delayDuration={350}>
      <ThemeController />
      <HashRouter>
        <TitleBar />
        <AppConnectionGate />
      </HashRouter>
    </Tooltip.Provider>
  );
}
