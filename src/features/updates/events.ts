export const MANUAL_UPDATE_CHECK_EVENT = "opp:manual-update-check";

export interface ManualUpdateCheckDetail {
  onSettled?: () => void;
}

export function requestManualUpdateCheck(onSettled?: () => void) {
  window.dispatchEvent(new CustomEvent<ManualUpdateCheckDetail>(
    MANUAL_UPDATE_CHECK_EVENT,
    { detail: { onSettled } },
  ));
}
