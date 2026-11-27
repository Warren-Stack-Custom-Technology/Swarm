import { computed, reactive, watch } from "vue";
import { api, ApiError } from "./api";
import { recordSpeed, type SpeedSample } from "./speedHistory";
import { GeoLookup, isPublicIp } from "./geo";
import { identity, preferences, allocateIdentities } from "./preferences";
import { statusGroup } from "./format";
import type {
  MainResponse,
  Peer,
  PeerResponse,
  PeerSnapshot,
  ServerState,
  Torrent,
  TorrentFile,
  Tracker,
} from "../types";
import type { MapConnection } from "./scene";

export const state = reactive({
  authenticated: false,
  connecting: true,
  version: "",
  error: "",
  notice: "",
  busy: false,
  lastSync: 0,
  torrents: {} as Record<string, Torrent>,
  server: {} as ServerState,
  categories: {} as Record<string, { name: string; savePath: string }>,
  tags: [] as string[],
  peers: {} as Record<string, PeerSnapshot>,
  peerErrors: {} as Record<string, string>,
  search: "",
  status: "all",
  category: "all",
  tag: "all",
  sort: "added_on",
  reverse: true,
  focusHash: "",
  selectedHash: "",
  inspectorOpen: false,
  inspectorTab: "overview",
  expanded: false,
  pinnedPeer: null as null | { hash: string; key: string; peer: Peer },
  checked: [] as string[],
  detail: {
    hash: "",
    properties: {} as Record<string, unknown>,
    files: [] as TorrentFile[],
    trackers: [] as Tracker[],
    error: "",
    loading: false,
  },
  history: [] as SpeedSample[],
  geoVersion: 0,
  geoBusy: false,
  geoError: "",
});
const geo = new GeoLookup();
let pendingActions = 0,
  lastMainError = "";
let rid: number | undefined,
  mainBusy = false,
  peersBusy = false,
  detailBusy = false,
  peerCursor = 0;
let timers: ReturnType<typeof setInterval>[] = [];
let geoController = new AbortController();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export const torrents = computed(() => Object.values(state.torrents));
export const filtered = computed(() =>
  torrents.value
    .filter((t) => {
      const query = state.search.trim().toLowerCase();
      return (
        (!query ||
          [t.name, t.category, t.tags, t.hash]
            .join(" ")
            .toLowerCase()
            .includes(query)) &&
        (state.status === "all" ||
          (state.status === "active"
            ? t.dlspeed + t.upspeed > 0
            : statusGroup(t.state) === state.status)) &&
        (state.category === "all" || t.category === state.category) &&
        (state.tag === "all" ||
          t.tags
            .split(",")
            .map((x) => x.trim())
            .includes(state.tag))
      );
    })
    .sort((a, b) => {
      const av = a[state.sort] ?? 0,
        bv = b[state.sort] ?? 0;
      const difference =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return (
        (difference || a.hash.localeCompare(b.hash)) * (state.reverse ? -1 : 1)
      );
    }),
);
export const hasFilters = computed(
  () =>
    !!state.search.trim() ||
    state.status !== "all" ||
    state.category !== "all" ||
    state.tag !== "all",
);
export function resetFilters() {
  state.search = "";
  state.status = "all";
  state.category = "all";
  state.tag = "all";
  state.focusHash = "";
}
export function focusTorrent(hash: string) {
  if (!state.torrents[hash]) return;
  if (!filtered.value.some((torrent) => torrent.hash === hash)) {
    resetFilters();
    announce("Filters cleared to show this transfer");
  }
  state.focusHash = hash;
  preferences.view = "atlas";
}
watch(filtered, (items) => {
  if (
    state.focusHash &&
    !items.some((torrent) => torrent.hash === state.focusHash)
  )
    state.focusHash = "";
});
export const selectedTorrent = computed(
  () => state.torrents[state.selectedHash],
);
export const scopedTorrents = computed(() =>
  state.focusHash
    ? filtered.value.filter((t) => t.hash === state.focusHash)
    : filtered.value,
);
export const scopedPeers = computed(() =>
  scopedTorrents.value.flatMap((torrent) =>
    Object.entries(state.peers[torrent.hash]?.peers ?? {}).map(
      ([key, peer]) => ({ hash: torrent.hash, key, peer, torrent }),
    ),
  ),
);
export const originIp = computed(
  () =>
    preferences.originOverride.trim() ||
    state.server.last_external_address_v4 ||
    state.server.last_external_address_v6 ||
    "",
);
export const origin = computed(() => {
  void state.geoVersion;
  return preferences.geoEnabled ? geo.get(originIp.value) : undefined;
});
export const connections = computed<MapConnection[]>(() => {
  void state.geoVersion;
  if (!preferences.geoEnabled) return [];
  return scopedPeers.value.flatMap(({ hash, key, peer, torrent }) => {
    const location = geo.get(peer.ip);
    return location
      ? [
          {
            id: hash + "|" + key,
            torrentName: torrent.name,
            ...identity(hash),
            ip: peer.ip,
            port: peer.port,
            seed: peer.progress >= 1,
            download: peer.dl_speed || 0,
            upload: peer.up_speed || 0,
            location,
          },
        ]
      : [];
  });
});
export const totals = computed(() =>
  scopedTorrents.value.reduce(
    (sum, t) => ({ down: sum.down + t.dlspeed, up: sum.up + t.upspeed }),
    { down: 0, up: 0 },
  ),
);
export const inspectedPeer = computed(() => {
  const pin = state.pinnedPeer;
  if (!pin) return null;
  const current = state.peers[pin.hash]?.peers[pin.key];
  return { ...pin, peer: current ?? pin.peer, connected: !!current };
});

export function announce(message: string) {
  state.notice = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (state.notice = ""), 4500);
}
function failure(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    state.authenticated = false;
    state.error = error.message;
  } else state.error = error instanceof Error ? error.message : String(error);
}
export async function operation(
  action: () => Promise<unknown>,
  message = "Updated",
) {
  pendingActions++;
  state.busy = true;
  state.error = "";
  try {
    await action();
    announce(message);
    await syncMain();
    return true;
  } catch (error) {
    failure(error);
    return false;
  } finally {
    state.busy = --pendingActions > 0;
  }
}

export function applyMain(response: MainResponse) {
  const next = response.full_update ? {} : { ...state.torrents };
  for (const [hash, patch] of Object.entries(response.torrents ?? {}))
    next[hash] = { ...next[hash], ...patch, hash } as Torrent;
  for (const hash of response.torrents_removed ?? []) delete next[hash];
  state.torrents = next;
  allocateIdentities(Object.keys(next));
  state.server = response.full_update
    ? { ...response.server_state }
    : { ...state.server, ...response.server_state };
  if (response.full_update) {
    state.categories = {};
    state.tags = [];
  }
  Object.assign(state.categories, response.categories);
  for (const key of response.categories_removed ?? [])
    delete state.categories[key];
  if (response.tags)
    state.tags = [...new Set([...state.tags, ...response.tags])];
  if (response.tags_removed)
    state.tags = state.tags.filter(
      (tag) => !response.tags_removed!.includes(tag),
    );
  state.checked = state.checked.filter((hash) => !!next[hash]);
  if (state.focusHash && !next[state.focusHash]) state.focusHash = "";
  for (const hash of Object.keys(state.peers))
    if (!next[hash]) delete state.peers[hash];
  rid = response.rid;
  state.lastSync = Date.now();
  recordSpeed(state.history, {
    at: state.lastSync,
    down: Number(state.server.dl_info_speed ?? 0),
    up: Number(state.server.up_info_speed ?? 0),
  });
}
export async function syncMain() {
  if (mainBusy || !state.authenticated || document.hidden) return;
  mainBusy = true;
  try {
    applyMain(await api.get<MainResponse>("sync/maindata", { rid: rid ?? 0 }));
    if (state.error === lastMainError) state.error = "";
    lastMainError = "";
  } catch (error) {
    failure(error);
    lastMainError = state.error;
  } finally {
    mainBusy = false;
  }
}
export function mergePeers(
  previous: PeerSnapshot | undefined,
  response: PeerResponse,
): PeerSnapshot {
  const next = response.full_update ? {} : { ...previous?.peers };
  for (const [key, patch] of Object.entries(response.peers ?? {}))
    next[key] = { ...next[key], ...patch } as Peer;
  for (const key of response.peers_removed ?? []) delete next[key];
  return { rid: response.rid, peers: next, updatedAt: Date.now() };
}
export async function syncPeers() {
  if (
    peersBusy ||
    !state.authenticated ||
    document.hidden ||
    (preferences.view === "library" &&
      !state.expanded &&
      (!state.inspectorOpen || state.inspectorTab !== "peers"))
  )
    return;
  peersBusy = true;
  try {
    const hashes = Object.keys(state.torrents).sort(),
      priority = state.focusHash || state.selectedHash;
    const background = hashes.filter((hash) => hash !== priority),
      batch = Array.from(
        { length: Math.min(priority ? 3 : 4, background.length) },
        (_, i) => background[(peerCursor + i) % background.length],
      );
    peerCursor = background.length
      ? (peerCursor + batch.length) % background.length
      : 0;
    if (priority && state.torrents[priority]) batch.unshift(priority);
    const results = await Promise.allSettled(
      batch.map((hash) =>
        api.get<PeerResponse>("sync/torrentPeers", {
          hash,
          rid: state.peers[hash]?.rid ?? 0,
        }),
      ),
    );
    results.forEach((result, i) => {
      const hash = batch[i];
      if (!state.torrents[hash]) return;
      if (result.status === "fulfilled") {
        state.peers[hash] = mergePeers(state.peers[hash], result.value);
        const pin = state.pinnedPeer;
        if (pin?.hash === hash && state.peers[hash].peers[pin.key])
          pin.peer = { ...state.peers[hash].peers[pin.key] };
        delete state.peerErrors[hash];
      } else {
        state.peerErrors[hash] = "Peer refresh failed";
        if (result.reason instanceof ApiError && result.reason.status === 403)
          failure(result.reason);
      }
    });
  } finally {
    peersBusy = false;
  }
}
export async function locate() {
  if (
    (preferences.view !== "atlas" && !state.expanded) ||
    state.geoBusy ||
    !preferences.geoEnabled ||
    !state.authenticated ||
    document.hidden
  )
    return;
  state.geoBusy = true;
  try {
    const wanted = [
      originIp.value,
      ...scopedPeers.value.map((item) => item.peer.ip),
    ];
    const updated = await geo.lookup(wanted, geoController.signal);
    if (updated) {
      state.geoVersion++;
      state.geoError = "";
    }
  } catch (error) {
    state.geoError =
      error instanceof Error ? error.message : "Location lookup unavailable";
  } finally {
    state.geoBusy = false;
  }
}
export async function loadDetail(force = false) {
  const hash = state.selectedHash,
    tab = state.inspectorTab;
  if (
    detailBusy ||
    !hash ||
    !state.inspectorOpen ||
    !state.authenticated ||
    document.hidden ||
    !state.torrents[hash]
  )
    return;
  detailBusy = true;
  if (state.detail.hash !== hash) {
    state.detail = {
      hash,
      properties: {},
      files: [],
      trackers: [],
      error: "",
      loading: true,
    };
  } else if (force) state.detail.loading = true;
  try {
    const endpoint =
      tab === "files"
        ? "files"
        : tab === "trackers"
          ? "trackers"
          : "properties";
    if (tab === "peers") {
      await syncPeers();
      return;
    }
    const result = await api.get(`torrents/${endpoint}`, { hash });
    if (hash !== state.selectedHash) return;
    if (endpoint === "files")
      state.detail.files = (result as TorrentFile[]).map((file, index) => ({
        ...file,
        index: file.index ?? index,
      }));
    else if (endpoint === "trackers")
      state.detail.trackers = result as Tracker[];
    else state.detail.properties = result as Record<string, unknown>;
    state.detail.hash = hash;
    state.detail.error = "";
  } catch (error) {
    if (hash === state.selectedHash)
      state.detail.error =
        error instanceof Error ? error.message : "Could not load details";
    if (error instanceof ApiError && error.status === 403) failure(error);
  } finally {
    detailBusy = false;
    state.detail.loading = false;
    if (
      state.inspectorOpen &&
      (state.selectedHash !== hash || state.inspectorTab !== tab)
    )
      queueMicrotask(() => void loadDetail(true));
  }
}
export function unpinPeer() {
  state.pinnedPeer = null;
  state.focusHash = "";
}
export function closeInspector() {
  state.inspectorOpen = false;
  state.selectedHash = "";
  unpinPeer();
}
export function inspectTorrent(hash: string, focus = true) {
  const changed = state.selectedHash !== hash;
  state.selectedHash = hash;
  state.inspectorOpen = true;
  if (changed) {
    state.pinnedPeer = null;
    state.inspectorTab = "overview";
  }
  if (focus) focusTorrent(hash);
  void loadDetail(true);
  void syncPeers();
}
export function inspectPeer(hash: string, key: string, peer?: Peer) {
  const current = peer ?? state.peers[hash]?.peers[key];
  if (!current) return;
  state.selectedHash = hash;
  state.pinnedPeer = { hash, key, peer: { ...current } };
  state.inspectorOpen = true;
  state.inspectorTab = "peers";
  void loadDetail(true);
}
export function inspectConnection(id: string) {
  const index = id.indexOf("|");
  if (index < 0) return;
  inspectPeer(id.slice(0, index), id.slice(index + 1));
}
export function setTab(tab: string) {
  state.inspectorTab = tab;
  void loadDetail(true);
}
export function toggleChecked(hash: string) {
  state.checked = state.checked.includes(hash)
    ? state.checked.filter((value) => value !== hash)
    : [...state.checked, hash];
}
export async function connect() {
  state.connecting = true;
  try {
    state.version = await api.connect();
    state.authenticated = true;
    state.error = "";
    rid = undefined;
    await syncMain();
    void syncPeers();
    return true;
  } catch (error) {
    failure(error);
    state.authenticated = false;
    return false;
  } finally {
    state.connecting = false;
  }
}
export async function login(username: string, password: string) {
  state.connecting = true;
  try {
    state.version = await api.login(username, password);
    state.authenticated = true;
    state.error = "";
    rid = undefined;
    await syncMain();
    void syncPeers();
    return true;
  } catch (error) {
    failure(error);
    return false;
  } finally {
    state.connecting = false;
  }
}
export function start() {
  if (timers.length) return;
  timers = [
    setInterval(() => void syncMain(), 1500),
    setInterval(() => void syncPeers(), 3000),
    setInterval(() => void locate(), 2000),
    setInterval(() => void loadDetail(), 3000),
  ];
  void connect();
}
export function stop() {
  timers.forEach(clearInterval);
  timers = [];
  geoController.abort();
  geoController = new AbortController();
}
export function setOrigin(value: string) {
  if (value && !isPublicIp(value))
    throw new Error("Enter a public IPv4 or IPv6 address.");
  preferences.originOverride = value;
  geoController.abort();
  geoController = new AbortController();
  void locate();
}
