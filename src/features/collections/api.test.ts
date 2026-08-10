import { describe, expect, it } from "vitest";

import type { CollectionSnapshot } from "../../shared/types/osu";
import { removeFromCollectionsSnapshot } from "./api";

const snapshot: CollectionSnapshot = {
  folders: [{
    id: "folder-1",
    name: "Favorites",
    creator: "",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    source: "opp",
    read_only: false,
    pending_write: false,
    entries: [{
      id: "entry-1",
      beatmap_id: 1,
      beatmapset_id: 2,
      checksum: null,
      ruleset: "osu",
      difficulty_name: "Hard",
      title: "Song",
      artist: "Artist",
      creator: "Mapper",
      resolved: false,
    }],
  }],
  sources: [],
};

describe("removeFromCollectionsSnapshot", () => {
  it("removes an entry immediately and marks the folder for write-back", () => {
    const result = removeFromCollectionsSnapshot(snapshot, "folder-1", "entry-1");

    expect(result?.folders[0].entries).toEqual([]);
    expect(result?.folders[0].pending_write).toBe(true);
    expect(snapshot.folders[0].entries).toHaveLength(1);
  });

  it("removes a folder immediately", () => {
    expect(removeFromCollectionsSnapshot(snapshot, "folder-1")?.folders).toEqual([]);
  });
});
