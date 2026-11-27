import { describe, expect, test } from "vitest";
import { bestGlobeView } from "../src/lib/globe-fit";
import { projectLocation, type SwarmCamera } from "../src/lib/scene";

const camera: SwarmCamera = {
  mode: "globe", width: 900, height: 600, zoom: 1,
  yaw: 0, pitch: 0, panX: 0, panY: 0,
};
const location = (longitude: number, latitude = 0) => ({ longitude, latitude });
const visible = (points: ReturnType<typeof location>[], view: {yaw: number; pitch: number}) =>
  points.filter((p) => projectLocation(p.longitude, p.latitude, { ...camera, ...view }).visible).length;

describe("one-shot globe framing", () => {
  test("brings a hidden cluster forward while retaining the exit", () => {
    const points = [location(110, 20), location(120, 25), location(130, 15)];
    const exit = location(0);
    const view = bestGlobeView(points, exit, camera);
    expect(visible(points, camera)).toBe(0);
    expect(visible(points, view)).toBe(3);
    expect(visible([exit], view)).toBe(1);
  });
  test("finds the majority rather than a misleading average", () => {
    const points = [location(-100), location(0), location(100), location(105)];
    const view = bestGlobeView(points, undefined, camera);
    expect(visible(points, view)).toBe(3);
  });
  test("counts each connection when many peers share a location", () => {
    const points = [...Array.from({length: 20}, () => location(180)), location(0), location(70), location(-70)];
    const view = bestGlobeView(points, undefined, camera);
    expect(visible(points, view)).toBe(21);
  });
  test("handles clusters across the date line", () => {
    const points = [location(177, 30), location(-178, 35), location(170, 40)];
    const view = bestGlobeView(points, location(-140, 45), camera);
    expect(visible(points, view)).toBe(3);
  });
  test("handles polar clusters and never produces an invalid camera", () => {
    const points = [-170, -60, 50, 160].map(lon => location(lon, 85));
    const view = bestGlobeView(points, location(0, 80), camera);
    expect(visible(points, view)).toBe(4);
    expect(Number.isFinite(view.yaw) && Number.isFinite(view.pitch)).toBe(true);
  });
  test("does not hide an exactly opposite exit just to show a peer", () => {
    const exit = location(0);
    const view = bestGlobeView([location(180)], exit, camera);
    expect(visible([exit], view)).toBe(1);
    expect(visible([location(180)], view)).toBe(0);
  });
  test("keeps an already good view's visible count and accepts no data", () => {
    const points = Array.from({length: 80}, (_, i) => location(-45 + i, (i % 7) * 3));
    const view = bestGlobeView(points, location(0), camera);
    expect(visible(points, view)).toBeGreaterThanOrEqual(visible(points, camera));
    expect(bestGlobeView([], location(0), camera)).toEqual(camera);
    expect(bestGlobeView([location(NaN), location(0, 200)], undefined, camera)).toEqual(camera);
  });
});
