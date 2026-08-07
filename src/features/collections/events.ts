import type { CollectionCandidate } from "../../shared/types/osu";

export const collectionAddEvent = "opp:add-to-collection";

export function openCollectionDialog(candidates: CollectionCandidate[]) {
  window.dispatchEvent(new CustomEvent<CollectionCandidate[]>(collectionAddEvent, { detail: candidates }));
}
