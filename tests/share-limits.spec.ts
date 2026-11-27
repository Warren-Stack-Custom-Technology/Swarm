import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ActionDialog from "../src/components/ActionDialog.vue";
import LimitChoice from "../src/components/LimitChoice.vue";
import { commonLimit, shareLimitRequests, type LimitDraft } from "../src/lib/shareLimits";
import { state, stop } from "../src/lib/store";
import { api } from "../src/lib/api";
import type { Torrent } from "../src/types";
const a = { state: "uploading", progress: 1, size: 1000, dlspeed: 0, upspeed: 0, downloaded: 1000, uploaded: 1200, eta: 0, num_seeds: 0, num_leechs: 0, added_on: 0, save_path: "D:\\Transfers", category: "", tags: "", hash: "a".repeat(40), name: "Ubuntu", ratio: 1.2, ratio_limit: -1, seeding_time_limit: 90, inactive_seeding_time_limit: -1, share_limit_action: "Stop", share_limits_mode: "MatchAny", dl_limit: 0, up_limit: 8000000 } as Torrent;
const b = { ...a, hash: "b".repeat(40), ratio_limit: 2, seeding_time_limit: 240, share_limit_action: "EnableSuperSeeding", share_limits_mode: "MatchAll", up_limit: 1000000 };
const original: LimitDraft = { ratio_limit: -1, seeding_time_limit: 90, inactive_seeding_time_limit: -1 };
let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => { stop(); state.authenticated = false; state.busy = false; state.error = ""; state.torrents = { [a.hash]: { ...a } }; api.version = "v5.3.0"; });
afterEach(async () => { wrapper?.unmount(); wrapper = undefined; await flushPromises(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function backend() {
  const fetcher = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
    const params = options?.body as URLSearchParams;
    if (String(url).endsWith("torrents/setShareLimits")) {
      const required = ["hashes", "ratioLimit", "seedingTimeLimit", "inactiveSeedingTimeLimit", "shareLimitAction", "shareLimitsMode"];
      if (required.some(key => !params.has(key))) return { ok: false, status: 400, text: async () => "Missing arguments" };
    }
    return { ok: true, status: 200, text: async () => String(url).endsWith("app/preferences") ? JSON.stringify({ max_ratio_enabled: true, max_ratio: 1, max_ratio_act: 0 }) : "" };
  });
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
test("inherits the global cutoff with every field required by qBittorrent 5.3", async () => {
  const fetcher = backend();
  wrapper = mount(ActionDialog, { props: { action: "limits", hashes: [a.hash] } });
  await flushPromises();
  expect(wrapper.text()).toContain("No ratio cutoff");
  expect(wrapper.text()).not.toContain("−2");
  wrapper.findAllComponents(LimitChoice)[0].vm.$emit("update:modelValue", -2);
  await flushPromises();
  expect(wrapper.text()).toContain("Global ratio: 1.00");
  await wrapper.get("form").trigger("submit"); await flushPromises();
  const mutations = fetcher.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(mutations).toHaveLength(1);
  expect(String(mutations[0][0])).toContain("setShareLimits");
  expect(Object.fromEntries((mutations[0][1]?.body as URLSearchParams).entries())).toEqual({ hashes: a.hash, ratioLimit: "-2", seedingTimeLimit: "90", inactiveSeedingTimeLimit: "-1", shareLimitAction: "Stop", shareLimitsMode: "MatchAny" });
  expect(wrapper.emitted("close")).toHaveLength(1);
});
test("opening and saving limits without edits makes no mutations", async () => {
  const fetcher = backend(); wrapper = mount(ActionDialog, { props: { action: "limits", hashes: [a.hash] } }); await flushPromises();
  await wrapper.get("form").trigger("submit"); await flushPromises();
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
});
test("bulk edits preserve different times, actions, modes and speed limits", async () => {
  const fetcher = backend(); state.torrents[b.hash] = b;
  wrapper = mount(ActionDialog, { props: { action: "limits", hashes: [a.hash, b.hash] } }); await flushPromises();
  expect(wrapper.text()).toContain("Keep each transfer’s setting");
  wrapper.findAllComponents(LimitChoice)[0].vm.$emit("update:modelValue", -2); await flushPromises();
  await wrapper.get("form").trigger("submit"); await flushPromises();
  const mutations = fetcher.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(mutations).toHaveLength(2);
  const requests = mutations.map(([, options]) => Object.fromEntries((options?.body as URLSearchParams).entries()));
  expect(requests.map(request => request.ratioLimit)).toEqual(["-2", "-2"]);
  expect(requests.map(request => request.seedingTimeLimit)).toEqual(["90", "240"]);
  expect(requests.map(request => request.shareLimitAction)).toEqual(["Stop", "EnableSuperSeeding"]);
  expect(requests.map(request => request.shareLimitsMode)).toEqual(["MatchAny", "MatchAll"]);
});
test("changing only upload speed leaves all seeding settings alone", async () => {
  const fetcher = backend(); wrapper = mount(ActionDialog, { props: { action: "limits", hashes: [a.hash] } }); await flushPromises();
  await wrapper.findAll('input[type="number"]')[1].setValue(2000);
  await wrapper.get("form").trigger("submit"); await flushPromises();
  const mutations = fetcher.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(mutations).toHaveLength(1); expect(String(mutations[0][0])).toContain("setUploadLimit");
  expect((mutations[0][1]?.body as URLSearchParams).get("limit")).toBe("2048000");
});
test("validates share edits before sending any mutations", () => {
  expect(() => shareLimitRequests([a], { ...original, seeding_time_limit: 1.5 }, original)).toThrow("whole number");
  expect(() => shareLimitRequests([a], { ...original, ratio_limit: NaN }, original)).toThrow();
  expect(commonLimit([a, b], "ratio_limit")).toBeNull();
  expect(shareLimitRequests([a], { ...original, ratio_limit: 0 }, original)[0].ratioLimit).toBe(0);
});
