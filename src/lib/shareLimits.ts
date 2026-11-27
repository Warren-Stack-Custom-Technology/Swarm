import type { Torrent } from "../types";

export const limitFields = ["ratio_limit", "seeding_time_limit", "inactive_seeding_time_limit"] as const;
export type LimitField = typeof limitFields[number];
export type LimitDraft = Record<LimitField, number | null>;
export const limitValue = (torrent: Torrent, key: LimitField): number =>
  Number(torrent[key] ?? -2);

export function commonLimit(torrents: Torrent[], key: LimitField): number | null {
  const values = torrents.map(torrent => limitValue(torrent, key));
  return values.every(value => value === values[0]) ? (values[0] ?? -2) : null;
}

export function shareLimitRequests(torrents: Torrent[], draft: LimitDraft, initial: LimitDraft) {
  const changes = limitFields.filter(key => draft[key] !== null && draft[key] !== initial[key]);
  for (const key of changes) {
    const value = draft[key]!;
    if (!Number.isFinite(value) || (value < 0 && value !== -1 && value !== -2) ||
      (key !== "ratio_limit" && !Number.isInteger(value)))
      throw new Error("Enter a valid ratio or a whole number of minutes.");
  }
  if (!changes.length) return [];
  return torrents.map(torrent => {
    const value = (key: LimitField) => changes.includes(key) ? draft[key]! : limitValue(torrent, key);
    return {
      hashes: torrent.hash,
      ratioLimit: value("ratio_limit"),
      seedingTimeLimit: value("seeding_time_limit"),
      inactiveSeedingTimeLimit: value("inactive_seeding_time_limit"),
      shareLimitAction: String(torrent.share_limit_action ?? "Default"),
      shareLimitsMode: String(torrent.share_limits_mode ?? "Default"),
    };
  });
}
