import { desktopApi, type UpdateCheckResult } from "../../shared/lib/tauri";

let startupCheckPromise: Promise<UpdateCheckResult> | null = null;

export function getStartupUpdateCheck() {
  startupCheckPromise ??= desktopApi.checkForUpdates();
  return startupCheckPromise;
}

export function resetUpdateCheckSessionForTests() {
  startupCheckPromise = null;
}

export function shouldShowAutomaticUpdate(
  result: UpdateCheckResult,
  ignoredVersion?: string | null,
) {
  return !result.is_latest && result.latest_version !== ignoredVersion;
}
