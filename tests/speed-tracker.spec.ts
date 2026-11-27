import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SpeedTracker from "../src/components/SpeedTracker.vue";
import { chartData, recordSpeed, HISTORY_WINDOW, speedRanges } from "../src/lib/speedHistory";
import { state } from "../src/lib/store";
import { preferences } from "../src/lib/preferences";
let wrapper: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  preferences.speedTrackerOpen = true; state.expanded = false; state.lastSync = 100000;
  state.history = [{ at: 90000, down: 1048576, up: 2097152 }, { at: 100000, down: 0, up: 0 }];
  state.server = { dl_info_data: 1048576, up_info_data: 2097152, alltime_dl: 1073741824, alltime_ul: 2147483648, up_info_speed: 2097152 };
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); });
test("shows authoritative session/all-time totals, and retains history while collapsed", async () => {
  wrapper = mount(SpeedTracker);
  expect(wrapper.text()).toContain("This qBittorrent session"); expect(wrapper.text()).toContain("All time");
  expect(wrapper.text()).toContain("2.0 GiB"); expect(wrapper.text()).toContain("2.0 MiB/s");
  const samples = [...state.history];
  await wrapper.get(".tracker-toggle").trigger("click");
  expect(wrapper.find(".speed-chart").exists()).toBe(false); expect(state.history).toEqual(samples);
  await wrapper.get(".tracker-toggle").trigger("click"); expect(wrapper.find(".speed-chart").exists()).toBe(true);
});
test("period selection and independent upload/download toggles update the graph", async () => {
  wrapper = mount(SpeedTracker);
  expect(wrapper.find(".chart-download").exists()).toBe(true);
  await wrapper.get('.tracker-legend button:first-child').trigger("click");
  expect(wrapper.find(".chart-download").exists()).toBe(false); expect(wrapper.find(".chart-upload").exists()).toBe(true);
  expect(speedRanges.map(range => range.label)).toEqual(["Session", "5 minutes", "30 minutes", "1 hour", "3 hours", "6 hours", "12 hours", "24 hours"]);
  const menu = wrapper.findComponent({ name: "SelectMenu" }); menu.vm.$emit("update:modelValue", 21600); await flushPromises();
  expect(menu.props("modelValue")).toBe(21600);
});
test("does not invent zeros or connect across missing samples", () => {
  const graph = chartData([{ at: 1000, down: 0, up: 0 }, { at: 61000, down: 1, up: 2 }], 3600, 61000);
  expect(graph.uploadPath.match(/M/g)).toHaveLength(2); expect(graph.uploadPath).not.toContain("NaN");
  expect(chartData([], 0, 100).downloadPath).toBe("");
});
test("samples at five-second intervals and bounds retained data to 24 hours", () => {
  const history = [{ at: 0, down: 1, up: 1 }];
  recordSpeed(history, { at: 1000, down: 2, up: 2 }); expect(history).toHaveLength(1);
  recordSpeed(history, { at: 5000, down: 2, up: 2 }); expect(history).toHaveLength(2);
  recordSpeed(history, { at: HISTORY_WINDOW + 10000, down: 3, up: 3 }); expect(history).toHaveLength(1);
});
