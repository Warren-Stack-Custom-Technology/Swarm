/* eslint-disable @typescript-eslint/unbound-method -- Drawing context methods in these tests are vi.fn spies. */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  automaticTorrentShape,
  drawTorrentShape,
  SWARM_SHAPES,
} from "../src/lib/identity";
import { drawConnections, drawPackets, makeRoutes } from "../src/lib/renderer";
import {
  buildSceneRoute,
  clampFlatPan,
  flatWorldBounds,
  packetProgress,
  peersNearPoint,
  pointAlongRoute,
  projectLocation,
  sceneScale,
  trafficVelocity,
  zoomCameraAt,
} from "../src/lib/scene";
import type { MapConnection, SwarmCamera } from "../src/lib/scene";

const camera: SwarmCamera = {
  mode: "globe",
  width: 1000,
  height: 600,
  zoom: 1,
  yaw: 0,
  pitch: 0,
  panX: 0,
  panY: 0,
};
const origin = { ip: "1.1.1.1", latitude: 0, longitude: -30, label: "Exit" };
const connection: MapConnection = {
  id: "torrent:peer",
  torrentName: "Test torrent",
  color: "#65dfc0",
  shape: "triangle",
  ip: "8.8.8.8",
  port: 6881,
  seed: true,
  download: 8_000_000,
  upload: 8_000,
  location: { ip: "8.8.8.8", latitude: 20, longitude: 45, label: "Peer" },
};

function drawingContext() {
  return {
    canvas: { width: 1000, height: 600 },
    getTransform: () => ({ a: 1 }),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

afterEach(() => vi.unstubAllGlobals());

describe("Swarm globe and flat projection", () => {
  test("clips the far hemisphere and reveals it when rotated", () => {
    expect(projectLocation(0, 0, camera)).toMatchObject({
      x: 500,
      y: 300,
      visible: true,
    });
    expect(projectLocation(180, 0, camera).visible).toBe(false);
    expect(projectLocation(180, 0, { ...camera, yaw: -180 }).visible).toBe(
      true,
    );
  });
  test("raises arcs above the sphere and preserves geographic endpoints", () => {
    const point = projectLocation(45, 0, camera);
    const raised = projectLocation(45, 0, camera, 0.2);
    expect(raised.x - 500).toBeCloseTo((point.x - 500) * 1.2);
    const route = buildSceneRoute(connection, origin, camera);
    expect(route.points[0].x).toBeCloseTo(
      projectLocation(origin.longitude, origin.latitude, camera).x,
    );
    expect(route.points[0].y).toBeCloseTo(
      projectLocation(origin.longitude, origin.latitude, camera).y,
    );
    expect(route.points.at(-1)?.x).toBeCloseTo(route.node.x);
    expect(route.points.at(-1)?.y).toBeCloseTo(route.node.y);
    expect(route.points).toHaveLength(41);
  });
  test("uses the short route across the dateline on the flat map", () => {
    const flat = { ...camera, mode: "flat" as const };
    const route = buildSceneRoute(
      {
        ...connection,
        location: { ...connection.location, longitude: -170, latitude: 0 },
      },
      { ...origin, longitude: 170 },
      flat,
    );
    const span = sceneScale(flat) * Math.PI * 2;
    expect(Math.abs(route.points.at(-1)!.x - route.points[0].x)).toBeLessThan(
      span / 5,
    );
    expect(route.shifts).toHaveLength(2);
  });
  test("keeps flat routes within latitude bounds and clips them to the single geography rectangle", () => {
    const flat = { ...camera, mode: "flat" as const };
    const route = buildSceneRoute(
      {
        ...connection,
        location: { ...connection.location, longitude: -170, latitude: 65 },
      },
      { ...origin, longitude: 170, latitude: 70 },
      flat,
    );
    const bounds = flatWorldBounds(flat);
    for (const point of route.points) {
      expect(point.y).toBeGreaterThanOrEqual(bounds.top);
      expect(point.y).toBeLessThanOrEqual(bounds.top + bounds.height);
    }
    const context = drawingContext();
    drawConnections(context, [route], "");
    expect(context.rect).toHaveBeenCalledWith(
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
    );
    expect(context.clip).toHaveBeenCalledOnce();
  });
  test("prevents panning away from the map and anchors zoom to the cursor", () => {
    expect(
      clampFlatPan({ ...camera, mode: "flat", panX: 10000, panY: -10000 }),
    ).toEqual({ x: 0, y: 0 });
    const flat = { ...camera, mode: "flat" as const, zoom: 2 };
    const point = projectLocation(30, 0, flat);
    const after = projectLocation(30, 0, zoomCameraAt(flat, 1.2, point));
    expect(after.x).toBeCloseTo(point.x);
    expect(after.y).toBeCloseTo(point.y);
    expect(zoomCameraAt(flat, 0.01).zoom).toBe(1);
  });
  test("does not draw orphaned globe traffic when the exit is on the far side", () => {
    const route = buildSceneRoute(
      connection,
      { ...origin, longitude: 180 },
      camera,
    );
    expect(route.node.visible).toBe(true);
    expect(route.points.every((point) => !point.visible)).toBe(true);
    expect(drawPackets(drawingContext(), [route], 1, "")).toBe(0);
  });
  test("returns all overlapping peer hits so they can be cycled", () => {
    const routes = makeRoutes(
      [connection, { ...connection, id: "second" }],
      origin,
      camera,
    );
    expect(
      peersNearPoint(routes, routes[0].node.x, routes[0].node.y).map(
        (peer) => peer.id,
      ),
    ).toEqual([connection.id, "second"]);
  });
  test("hides idle routes by default but retains endpoints and can reveal the route", () => {
    const idle = makeRoutes(
      [{ ...connection, download: 0, upload: 0 }],
      origin,
      camera,
    );
    const context = drawingContext();
    drawConnections(context, idle, "");
    expect(context.lineTo).toHaveBeenCalledTimes(2); // triangle endpoint, no geographic route
    vi.mocked(context.lineTo).mockClear();
    drawConnections(context, idle, "", true);
    expect(vi.mocked(context.lineTo).mock.calls.length).toBeGreaterThan(2);
  });
  test("does not invent paths when the origin is unknown", () => {
    expect(makeRoutes([connection], undefined, camera)).toEqual([]);
  });
  test("does not interpolate markers across an invisible segment", () => {
    const route = buildSceneRoute(
      { ...connection, location: { ...connection.location, longitude: 160 } },
      origin,
      camera,
    );
    expect(pointAlongRoute(route.points, 0.99)).toBeUndefined();
  });
});

describe("Swarm directional traffic", () => {
  test("moves upload outward and download inward using the same speed scale", () => {
    expect(packetProgress(0.3, 1, 100_000, "upload")).toBeGreaterThan(0.3);
    expect(packetProgress(0.3, 1, 100_000, "download")).toBeLessThan(0.7);
    expect(
      packetProgress(0.3, 1, 100_000, "upload") +
        packetProgress(0.3, 1, 100_000, "download"),
    ).toBeCloseTo(1);
    expect(trafficVelocity(8_000_000)).toBeGreaterThan(trafficVelocity(8_000));
    expect(trafficVelocity(0)).toBe(0);
    expect(trafficVelocity(Number.MAX_VALUE)).toBeLessThanOrEqual(0.5);
  });
  test("draws no moving markers for idle peers and enforces the particle budget", () => {
    const context = drawingContext();
    const idle = makeRoutes(
      [{ ...connection, download: 0, upload: 0 }],
      origin,
      camera,
    );
    expect(drawPackets(context, idle, 1, "")).toBe(0);
    const routes = makeRoutes(
      Array.from({ length: 200 }, (_, index) => ({
        ...connection,
        id: `torrent:${index}`,
      })),
      origin,
      camera,
    );
    expect(drawPackets(context, routes, 1, "", 5)).toBe(5);
    expect(context.fill).toHaveBeenCalledTimes(5);
  });
  test("reuses a cached shape sprite for matching traffic markers", () => {
    const drawing = drawingContext();
    const getContext = vi.fn(() => drawing);
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number,
        ) {}
        getContext = getContext;
      },
    );
    const context = drawingContext();
    const routes = makeRoutes([connection], origin, camera);
    drawPackets(context, routes, 1, "", 2);
    expect(getContext).toHaveBeenCalledOnce();
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(drawing.fill).toHaveBeenCalledOnce();
  });
  test("maintains independent saved phases for both directions instead of jumping when speed changes", () => {
    const context = drawingContext();
    const phases = new Map([
      [`${connection.id}:upload`, 0.4],
      [`${connection.id}:download`, 0.2],
    ]);
    const first = makeRoutes([connection], origin, camera);
    drawPackets(context, first, 999, "", 2, phases);
    const position = vi
      .mocked(context.moveTo)
      .mock.calls.map((call) => [...call]);
    vi.mocked(context.moveTo).mockClear();
    drawPackets(
      context,
      makeRoutes(
        [{ ...connection, download: 8000, upload: 8000000 }],
        origin,
        camera,
      ),
      10000,
      "",
      2,
      phases,
    );
    expect(vi.mocked(context.moveTo).mock.calls).toEqual(position);
  });
});

describe("Swarm colour and shape identities", () => {
  test("assigns deterministic identities independent of torrent order", () => {
    const before = automaticTorrentShape("abcdef");
    automaticTorrentShape("another torrent");
    expect(automaticTorrentShape("abcdef")).toBe(before);
    expect(SWARM_SHAPES).toContain(before);
  });
  test.each(SWARM_SHAPES)(
    "keeps %s markers the same screen size at any zoom",
    (shape) => {
      const context = drawingContext();
      drawTorrentShape(context, shape, 50, 50, 4);
      expect(context.fill).toHaveBeenCalledOnce();
      if (shape === "circle")
        expect(context.arc).toHaveBeenCalledWith(50, 50, 3.04, 0, Math.PI * 2);
      else
        for (const [x, y] of vi.mocked(context.lineTo).mock.calls) {
          expect(Math.abs(x - 50)).toBeLessThanOrEqual(4);
          expect(Math.abs(y - 50)).toBeLessThanOrEqual(4);
        }
    },
  );
});

describe("larger readable traffic", () => {
  test("marker size changes glyph extent while the particle budget stays fixed", () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    const routes = makeRoutes([connection], origin, camera);
    const small = drawingContext(),
      large = drawingContext();
    expect(drawPackets(small, routes, 1, "", 1, undefined, 5)).toBe(1);
    expect(drawPackets(large, routes, 1, "", 1, undefined, 10)).toBe(1);
    const width = (ctx: CanvasRenderingContext2D) => {
      const x = [
        ...vi.mocked(ctx.moveTo).mock.calls,
        ...vi.mocked(ctx.lineTo).mock.calls,
      ].map((p) => p[0]);
      return Math.max(...x) - Math.min(...x);
    };
    expect(width(large)).toBeGreaterThan(width(small) * 1.8);
  });
  test("keeps selected traffic visible when the render budget is exhausted", () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    const routes = makeRoutes(
      [
        { ...connection, id: "other", color: "#32caff" },
        { ...connection, id: "chosen", color: "#ff5268" },
      ],
      origin,
      camera,
    );
    const ctx = drawingContext();
    expect(drawPackets(ctx, routes, 1, "chosen", 1)).toBe(1);
    expect(ctx.fillStyle).toBe("#ff5268");
  });
});
