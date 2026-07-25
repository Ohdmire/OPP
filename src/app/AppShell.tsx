import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import type { CommandError, Ruleset } from "../shared/types/osu";
import { authQueryKey } from "../features/auth/api";
import { useOwnProfile } from "../features/profile/api";
import { useMode } from "./ModeContext";
import { Sidebar } from "./Sidebar";
import { GlobalContextBar } from "./GlobalContextBar";

const validRulesets: Ruleset[] = ["osu", "taiko", "fruits", "mania"];

export function AppShell() {
  const { ruleset, setRuleset, hasRulesetPreference } = useMode();
  const profileQuery = useOwnProfile(ruleset);
  const initializedMode = useRef(hasRulesetPreference);
  const queryClient = useQueryClient();

  useEffect(() => {
    const defaultMode = profileQuery.data?.data.playmode;
    if (
      !initializedMode.current &&
      defaultMode &&
      validRulesets.includes(defaultMode)
    ) {
      initializedMode.current = true;
      setRuleset(defaultMode);
    }
  }, [profileQuery.data, setRuleset]);

  useEffect(() => {
    const error = profileQuery.error as CommandError | null;
    if (error?.code === "AUTH_REQUIRED") {
      queryClient.invalidateQueries({ queryKey: authQueryKey });
    }
  }, [profileQuery.error, queryClient]);

  return (
    <div className="min-h-screen">
      <Sidebar
        loading={profileQuery.isLoading}
        profile={profileQuery.data?.data}
      />
      <GlobalContextBar />
      <main className="ml-[224px] min-h-screen pt-[104px]">
        <div className="relative min-h-[calc(100vh-104px)] overflow-hidden">
          <div className="relative mx-auto max-w-[1480px] p-8 xl:p-10">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
