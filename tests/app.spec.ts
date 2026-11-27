import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import App from "../src/App.vue";
import ActionDialog from "../src/components/ActionDialog.vue";
import { api } from "../src/lib/api";
import {
  state,
  applyMain,
  inspectPeer,
  inspectTorrent,
  mergePeers,
  stop,
  syncMain,
  syncPeers,
  scopedTorrents,
} from "../src/lib/store";
import { preferences } from "../src/lib/preferences";
import type { Peer, Torrent } from "../src/types";
const hash = "a".repeat(40),
  second = "b".repeat(40),
  key = "8.8.8.8:6881";
const peer: Peer = {
  ip: "8.8.8.8",
  port: 6881,
  client: "qBittorrent",
  country: "Canada",
  progress: 1,
  dl_speed: 40000,
  up_speed: 1500,
  downloaded: 1,
  uploaded: 1,
};
const torrent: Torrent = {
  hash,
  name: "A transfer with a stable inspector",
  state: "downloading",
  progress: 0.5,
  size: 1000000,
  dlspeed: 1000,
  upspeed: 200,
  downloaded: 500000,
  uploaded: 10000,
  ratio: 0.2,
  eta: 100,
  num_seeds: 1,
  num_leechs: 2,
  added_on: 1000,
  save_path: "D:\\Transfers",
  category: "",
  tags: "",
};
let wrappers: ReturnType<typeof mount>[] = [];
function reply(value: unknown) {
  return {
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        typeof value === "string" ? value : JSON.stringify(value),
      ),
  };
}
function backend() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname.replace("/api/v2/", "");
    if (path === "app/version") return Promise.resolve(reply("v5.2.0"));
    if (path === "sync/maindata")
      return Promise.resolve(
        reply({
          rid: 1,
          full_update: true,
          torrents: {
            [hash]: torrent,
            [second]: { ...torrent, hash: second, name: "Second transfer" },
          },
          server_state: { dl_info_speed: 1000, up_info_speed: 200 },
          categories: {},
          tags: [],
        }),
      );
    if (path === "sync/torrentPeers")
      return Promise.resolve(
        reply({ rid: 1, full_update: true, peers: { [key]: peer } }),
      );
    if (path === "torrents/files")
      return Promise.resolve(
        reply([{ name: "image.iso", size: 1000, progress: 0.5, priority: 1 }]),
      );
    if (path === "torrents/trackers") return Promise.resolve(reply([]));
    return Promise.resolve(reply({}));
  });
}
beforeEach(() => {
  stop();
  localStorage.clear();
  preferences.geoEnabled = false;
  preferences.view = "atlas";
  preferences.mode = "globe";
  preferences.animate = false;
  Object.assign(state, {
    authenticated: false,
    connecting: true,
    error: "",
    notice: "",
    busy: false,
    torrents: {},
    server: {},
    peers: {},
    peerErrors: {},
    checked: [],
    focusHash: "",
    selectedHash: "",
    inspectorOpen: false,
    inspectorTab: "overview",
    expanded: false,
    pinnedPeer: null,
    search: "",
    status: "all",
    category: "all",
    tag: "all",
    detail: {
      hash: "",
      files: [],
      trackers: [],
      properties: {},
      error: "",
      loading: false,
    },
  });
  vi.stubGlobal("fetch", backend());
});
afterEach(async () => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers = [];
  stop();
  await flushPromises();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function app() {
  const wrapper = mount(App, {attachTo:document.body});
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
describe("standalone application", () => {
  test("loads the direct API and provides its own shell", async () => {
    const wrapper = await app();
    expect(wrapper.text()).toContain("swarm.");
    expect(wrapper.text()).not.toContain("VueTorrent");
    expect(wrapper.findAll(".transfer-card")).toHaveLength(2);
    expect(wrapper.get(".app-footer").text()).toContain(
      "qBittorrent connected",
    );
  });
  test("keeps the same inspector DOM instance and peer pin when expanding and changing projections", async () => {
    const wrapper = await app();
    inspectPeer(hash, key, peer);
    await flushPromises();
    const element = wrapper.get(".inspector").element;
    expect(wrapper.get(".pinned-peer").text()).toContain("8.8.8.8");
    await wrapper.get('[aria-label="Expand workspace"]').trigger("click");
    expect(state.expanded).toBe(true);
    expect(wrapper.get(".inspector").element).toBe(element);
    preferences.mode = "flat";
    await flushPromises();
    await syncMain();
    await syncPeers();
    await flushPromises();
    expect(wrapper.get(".pinned-peer").text()).toContain("8.8.8.8");
    expect(state.selectedHash).toBe(hash);
    expect(wrapper.get(".inspector").element).toBe(element);
  });
  test("does not discard the pinned peer when it disconnects or the map filter changes", async () => {
    const wrapper = await app();
    inspectPeer(hash, key, peer);
    await flushPromises();
    state.peers[hash] = mergePeers(state.peers[hash], {
      rid: 2,
      peers_removed: [key],
    });
    state.focusHash = second;
    state.expanded = true;
    await flushPromises();
    expect(wrapper.get(".pinned-peer").text()).toContain("Disconnected");
    expect(wrapper.get(".pinned-peer").text()).toContain("8.8.8.8");
    expect(state.selectedHash).toBe(hash);
  });
  test("keeps inspector tab and identity while live main-data patches arrive", async () => {
    const wrapper = await app();
    inspectTorrent(hash);
    state.inspectorTab = "files";
    await flushPromises();
    state.detail.hash = hash;
    state.detail.files = [
      { index: 0, name: "image.iso", size: 1000, progress: 0.5, priority: 1 },
    ];
    applyMain({
      rid: 2,
      torrents: { [hash]: { progress: 0.7, upspeed: 999 } },
    });
    await flushPromises();
    expect(state.inspectorTab).toBe("files");
    expect(state.selectedHash).toBe(hash);
    expect(wrapper.text()).toContain("image.iso");
    expect(state.torrents[hash].name).toBe(torrent.name);
  });
  test("opens torrent cards and preserves pin on leaving expanded mode", async () => {
    const wrapper = await app();
    await wrapper.findAll(".transfer-card")[0].trigger("click");
    await flushPromises();
    expect(state.inspectorOpen).toBe(true);
    const selected = state.selectedHash;
    state.expanded = true;
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(state.expanded).toBe(false);
    expect(state.inspectorOpen).toBe(true);
    expect(state.selectedHash).toBe(selected);
  });
  test("does not close expanded workspace when Escape belongs to a native select", async () => {
    const wrapper = await app();
    state.expanded = true;
    await flushPromises();
    await wrapper
      .get('[aria-label="Inspect a peer connection"]')
      .trigger("keydown", { key: "Escape" });
    expect(state.expanded).toBe(true);
  });
});
describe("transfer actions", () => {
  test("removes a job with deleteFiles=false unless the user explicitly selects file deletion", async () => {
    state.authenticated = true;
    api.version = "v5.2.0";
    state.torrents = { [hash]: torrent };
    const fetcher = vi.mocked(fetch);
    const wrapper = mount(ActionDialog, {
      props: { action: "remove", hashes: [hash] },
    });
    wrappers.push(wrapper);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const call = fetcher.mock.calls.find(([url]) =>
      String(url).endsWith("/torrents/delete"),
    );
    expect(call).toBeTruthy();
    expect((call![1]!.body as URLSearchParams).get("deleteFiles")).toBe(
      "false",
    );
  });
  test("normalizes file indexes from older API responses", async () => {
    const wrapper = await app();
    inspectTorrent(hash);
    state.inspectorTab = "files";
    await flushPromises();
    const { loadDetail } = await import("../src/lib/store");
    await loadDetail(true);
    expect(state.detail.files[0]?.index).toBe(0);
    expect(wrapper.text()).toContain("image.iso");
  });
  test("preserves other torrent fields and removes explicitly deleted hashes in incremental updates", () => {
    state.torrents = {
      [hash]: torrent,
      [second]: { ...torrent, hash: second },
    };
    applyMain({
      rid: 5,
      torrents: { [hash]: { progress: 0.8 } },
      torrents_removed: [second],
    });
    expect(state.torrents[hash].name).toBe(torrent.name);
    expect(state.torrents[hash].progress).toBe(0.8);
    expect(state.torrents[second]).toBeUndefined();
  });
});

describe("one coherent transfer workspace", () => {
  test.each([false, true])("closing inspection restores all connections (expanded: %s)", async (expanded) => {
    const wrapper = await app();
    inspectTorrent(hash);
    inspectPeer(hash, key, peer);
    state.expanded = expanded;
    await flushPromises();
    expect(scopedTorrents.value.map((t) => t.hash)).toEqual([hash]);
    await wrapper.get('[aria-label="Close inspector"]').trigger("click");
    await flushPromises();
    expect(state.inspectorOpen).toBe(false);
    expect(state.pinnedPeer).toBeNull();
    expect(state.selectedHash).toBe("");
    expect(state.focusHash).toBe("");
    expect(scopedTorrents.value.map((t) => t.hash).sort()).toEqual([hash, second]);
    expect(state.expanded).toBe(expanded);
    await syncMain();
    await syncPeers();
    expect(state.inspectorOpen).toBe(false);
    expect(state.focusHash).toBe("");
  });
  test("unpinning a peer restores the full atlas and keeps transfer details open", async () => {
    const wrapper = await app();
    inspectTorrent(hash);
    inspectPeer(hash, key, peer);
    await flushPromises();
    await wrapper.get('[aria-label="Unpin peer"]').trigger("click");
    expect(state.pinnedPeer).toBeNull();
    expect(state.focusHash).toBe("");
    expect(scopedTorrents.value).toHaveLength(2);
    expect(state.inspectorOpen).toBe(true);
    expect(state.selectedHash).toBe(hash);
  });
  test("Escape first leaves expanded mode, then closes inspection and restores the atlas", async () => {
    await app();
    inspectTorrent(hash);
    inspectPeer(hash, key, peer);
    state.expanded = true;
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(state.inspectorOpen).toBe(true);
    expect(state.focusHash).toBe(hash);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(state.inspectorOpen).toBe(false);
    expect(state.pinnedPeer).toBeNull();
    expect(state.focusHash).toBe("");
    expect(scopedTorrents.value).toHaveLength(2);
  });
  test("closing inspection clears connection focus while respecting sidebar filters", async () => {
    const wrapper = await app();
    state.search = "Second";
    inspectTorrent(second);
    await flushPromises();
    await wrapper.get('[aria-label="Close inspector"]').trigger("click");
    expect(state.focusHash).toBe("");
    expect(state.search).toBe("Second");
    expect(scopedTorrents.value.map((t) => t.hash)).toEqual([second]);
  });
  test("shows one transfer surface and one filter set in each view", async () => {
    const wrapper = await app();
    expect(wrapper.findAll(".transfer-controls")).toHaveLength(1);
    expect(wrapper.findAll('[aria-label="Search transfers"]')).toHaveLength(1);
    expect(wrapper.find(".atlas-scope").exists()).toBe(false);
    preferences.view = "library";
    await flushPromises();
    expect(wrapper.find(".transfer-list").exists()).toBe(false);
    expect(wrapper.find(".library-table").exists()).toBe(true);
    expect(wrapper.findAll(".transfer-controls")).toHaveLength(1);
    expect(wrapper.findAll('[aria-label="Search transfers"]')).toHaveLength(1);
    expect(
      wrapper.findAll('[aria-label="Select all visible transfers"]'),
    ).toHaveLength(1);
    expect(wrapper.findAll(".header-actions .primary")).toHaveLength(1);
  });
  test("always exposes the share ratio on each sidebar row", async () => {
    const wrapper = await app();
    expect(wrapper.findAll(".transfer-ratio-row")).toHaveLength(2);
    expect(
      wrapper.findAll(".transfer-ratio-row strong").map((item) => item.text()),
    ).toEqual(["0.20", "0.20"]);
  });
  test("keeps inspection pinned when filters hide its focused torrent", async () => {
    const wrapper = await app();
    inspectTorrent(hash);
    inspectPeer(hash, key, peer);
    await flushPromises();
    await wrapper.get('[aria-label="Search transfers"]').setValue("Second");
    await flushPromises();
    const { scopedTorrents } = await import("../src/lib/store");
    expect(state.focusHash).toBe("");
    expect(scopedTorrents.value.map((t) => t.hash)).toEqual([second]);
    expect(state.selectedHash).toBe(hash);
    expect(wrapper.get(".pinned-peer").text()).toContain(peer.ip);
  });
  test("reopening the same torrent preserves its detail tab and pinned peer", async () => {
    await app();
    inspectPeer(hash, key, peer);
    state.inspectorTab = "files";
    await flushPromises();
    inspectTorrent(hash);
    await flushPromises();
    expect(state.inspectorTab).toBe("files");
    expect(state.pinnedPeer?.key).toBe(key);
  });
  test("Escape dismisses an action menu before collapsing the workspace", async () => {
    const wrapper = await app();
    inspectTorrent(hash);
    state.expanded = true;
    await flushPromises();
    const menu = wrapper.get("details.action-menu")
      .element as HTMLDetailsElement;
    menu.open = true;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(menu.open).toBe(false);
    expect(state.expanded).toBe(true);
    expect(state.inspectorOpen).toBe(true);
  });
});
