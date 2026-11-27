import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import Atlas from "../src/components/Atlas.vue";
import * as renderer from "../src/lib/renderer";
import { GeoLookup } from "../src/lib/geo";
import { state, stop } from "../src/lib/store";
import { preferences } from "../src/lib/preferences";
import { projectLocation } from "../src/lib/scene";
import type { Peer, Torrent } from "../src/types";
const hash = "a".repeat(40),
  key = "8.8.8.8:6881",
  id = hash + "|" + key;
const peer: Peer = {
  ip: "8.8.8.8",
  port: 6881,
  client: "Example",
  country: "Canada",
  progress: 0.4,
  dl_speed: 30000,
  up_speed: 40000,
  downloaded: 10,
  uploaded: 12,
};
let wrapper: ReturnType<typeof mount> | undefined,
  frames: FrameRequestCallback[] = [],
  markerX = 400;
beforeEach(() => {
  stop();
  markerX = 400;
  frames = [];
  Object.assign(state, {
    authenticated: false,
    torrents: {
      [hash]: {
        hash,
        name: "Example transfer",
        state: "uploading",
        progress: 1,
        size: 1000000,
        dlspeed: 30000,
        upspeed: 40000,
        downloaded: 1000000,
        uploaded: 1200000,
        ratio: 1.2,
        eta: 100,
        num_seeds: 1,
        num_leechs: 1,
        added_on: 1,
        save_path: "",
        category: "",
        tags: "",
      } as Torrent,
    },
    peers: {
      [hash]: { rid: 1, peers: { [key]: { ...peer } }, updatedAt: Date.now() },
    },
    server: { last_external_address_v4: "1.1.1.1" },
    selectedHash: "",
    pinnedPeer: null,
    focusHash: "",
    inspectorOpen: false,
    inspectorTab: "overview",
    search: "",
    status: "all",
    category: "all",
    tag: "all",
    expanded: false,
  });
  Object.assign(preferences, {
    view: "atlas",
    mode: "flat",
    geoEnabled: true,
    originOverride: "",
    animate: false,
    showIdle: false,
  });
  vi.spyOn(GeoLookup.prototype, "get").mockImplementation((ip) =>
    ip === "1.1.1.1"
      ? { ip, latitude: 0, longitude: -30, label: "Exit" }
      : { ip, latitude: 20, longitude: 45, label: "Peer" },
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 900,
    bottom: 600,
    x: 0,
    y: 0,
    width: 900,
    height: 600,
    toJSON() {},
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        canvas: this,
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
    },
  );
  vi.spyOn(renderer, "drawWorld").mockImplementation(() => {});
  vi.spyOn(renderer, "drawConnections").mockImplementation(() => {});
  vi.spyOn(renderer, "drawOrigin").mockImplementation(() => {});
  vi.spyOn(renderer, "drawPackets").mockImplementation(
    (_ctx, _routes, _elapsed, _selected, _budget, _phases, _size, targets) => {
      if (targets) {
        targets[0] = { id, x: markerX, y: 250, radius: 14 };
        targets.length = 1;
      }
      return 1;
    },
  );
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  stop();
  vi.restoreAllMocks();
});
async function atlas() {
  wrapper = mount(Atlas);
  await flushPromises();
  expect(frames.length).toBeGreaterThan(0);
  frames[0](100);
  await flushPromises();
  return wrapper.get("canvas");
}
describe("actual map pointer inspection", () => {
  test("Show most rotates hidden peers into view, resets zoom, and retains inspection", async () => {
    preferences.mode = "globe";
    vi.mocked(GeoLookup.prototype.get).mockImplementation((ip) =>
      ip === "1.1.1.1"
        ? { ip, latitude: 0, longitude: -30, label: "Exit" }
        : { ip, latitude: 20, longitude: 150, label: "Peer" },
    );
    state.pinnedPeer = { hash, key, peer: { ...peer } };
    await atlas();
    const before = vi.mocked(renderer.drawWorld).mock.calls.at(-1)![1];
    expect(projectLocation(150, 20, before).visible).toBe(false);
    await wrapper!.get('[aria-label="Zoom in"]').trigger("click");
    await wrapper!.get('[aria-label="Show most connections"]').trigger("click");
    frames.at(-1)!(200);
    const after = vi.mocked(renderer.drawWorld).mock.calls.at(-1)![1];
    expect(projectLocation(150, 20, after).visible).toBe(true);
    expect(projectLocation(-30, 0, after).visible).toBe(true);
    expect(after.zoom).toBe(1);
    expect(state.pinnedPeer?.key).toBe(key);
    preferences.mode = "flat";
    await flushPromises();
    expect(wrapper!.find('[aria-label="Show most connections"]').exists()).toBe(false);
  });
  test("pins a moving marker and keeps the mouse-down target if it moves before release", async () => {
    const canvas = await atlas();
    await canvas.trigger("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 400,
      clientY: 250,
    });
    markerX = 650;
    frames[0](150);
    await canvas.trigger("pointerup", {
      button: 0,
      pointerId: 1,
      clientX: 400,
      clientY: 250,
    });
    expect(state.pinnedPeer?.key).toBe(key);
    expect(state.inspectorOpen).toBe(true);
    expect(state.inspectorTab).toBe("peers");
  });
  test("does not inspect a connection when the gesture is a map drag", async () => {
    const canvas = await atlas();
    await canvas.trigger("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 400,
      clientY: 250,
    });
    await canvas.trigger("pointermove", {
      pointerId: 1,
      clientX: 440,
      clientY: 250,
    });
    await canvas.trigger("pointerup", {
      button: 0,
      pointerId: 1,
      clientX: 440,
      clientY: 250,
    });
    expect(state.pinnedPeer).toBeNull();
    expect(state.inspectorOpen).toBe(false);
  });
  test("retains a useful snapshot if the clicked peer disconnects during the click", async () => {
    const canvas = await atlas();
    await canvas.trigger("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 400,
      clientY: 250,
    });
    state.peers[hash].peers = {};
    await flushPromises();
    await canvas.trigger("pointerup", {
      button: 0,
      pointerId: 1,
      clientX: 400,
      clientY: 250,
    });
    expect(state.pinnedPeer?.peer.ip).toBe(peer.ip);
    expect(state.inspectorOpen).toBe(true);
  });
  test("does not dim active routes for a disconnected pin outside the map", async () => {
    state.pinnedPeer = { hash: "b".repeat(40), key: "gone", peer: { ...peer } };
    await atlas();
    expect(vi.mocked(renderer.drawConnections).mock.calls[0][2]).toBe("");
    expect(state.pinnedPeer?.key).toBe("gone");
  });
});
