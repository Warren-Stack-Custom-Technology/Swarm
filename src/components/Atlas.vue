<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { geoInterpolate } from "d3-geo";
import Icon from "./Icon.vue";
import Glyph from "./Glyph.vue";
import {
  drawConnections,
  drawOrigin,
  drawPackets,
  drawWorld,
  makeRoutes,
} from "../lib/renderer";
import {
  clampFlatPan,
  peersNearPoint,
  projectLocation,
  trafficVelocity,
  zoomCameraAt,
} from "../lib/scene";
import type { MapConnection, SceneRoute, SwarmCamera } from "../lib/scene";
import type { GeoLocation } from "../types";
import { speed } from "../lib/format";
import { identity, preferences } from "../lib/preferences";
import {
  connections,
  inspectedPeer,
  origin,
  scopedPeers,
  scopedTorrents,
  state,
  totals,
  torrents,
  inspectConnection,
  inspectTorrent,
} from "../lib/store";

const canvas = ref<HTMLCanvasElement>(),
  surface = ref<HTMLDivElement>();
const mode = computed(() => preferences.mode),
  zoom = ref(1),
  yaw = ref(100),
  pitch = ref(-25),
  pan = ref({ x: 0, y: 0 }),
  dimensions = ref({ width: 900, height: 600 });
const hoveredId = ref(""),
  overlap = ref(0),
  hiddenExit = ref(false),
  farSide = ref(0);
const hovered = computed(() =>
  connections.value.find((item) => item.id === hoveredId.value),
);
const selectedId = computed(() =>
  state.pinnedPeer ? state.pinnedPeer.hash + "|" + state.pinnedPeer.key : "",
);
const highlight = computed(() => selectedId.value || hoveredId.value);
const camera = computed<SwarmCamera>(() => ({
  ...dimensions.value,
  mode: mode.value,
  zoom: zoom.value,
  yaw: yaw.value,
  pitch: pitch.value,
  panX: pan.value.x,
  panY: pan.value.y,
}));
const scopeName = computed(() =>
  state.focusHash
    ? (state.torrents[state.focusHash]?.name ?? "Selected transfer")
    : "All transfers",
);
let routes: SceneRoute[] = [],
  world: HTMLCanvasElement | undefined,
  still: HTMLCanvasElement | undefined,
  observer: ResizeObserver | undefined,
  frame = 0,
  last = 0,
  worldDirty = true,
  dirty = true,
  disposed = false;
const phases = new Map<string, number>();
let drag:
  | {
      id: number;
      x: number;
      y: number;
      yaw: number;
      pitch: number;
      panX: number;
      panY: number;
      moved: boolean;
    }
  | undefined;
let reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
function showing() {
  return preferences.view === "atlas" || state.expanded;
}
function moving() {
  return (
    showing() &&
    preferences.animate &&
    !document.hidden &&
    !reduced?.matches &&
    routes.some(
      (route) =>
        route.points[0]?.visible &&
        (route.connection.download > 0 || route.connection.upload > 0),
    )
  );
}
function reset() {
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
  yaw.value = -(origin.value?.longitude ?? -100) - 25;
  pitch.value = -(origin.value?.latitude ?? 25) * 0.65;
}
function schedule(background = false) {
  worldDirty ||= background;
  dirty = true;
  if (!frame && !disposed && !document.hidden && showing() && canvas.value)
    frame = requestAnimationFrame(paint);
}
function layer(element: HTMLCanvasElement, ratio: number) {
  const w = Math.round(dimensions.value.width * ratio),
    h = Math.round(dimensions.value.height * ratio);
  if (element.width !== w || element.height !== h) {
    element.width = w;
    element.height = h;
  }
  const ctx = element.getContext("2d");
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
function paint(time: number) {
  frame = 0;
  if (
    disposed ||
    document.hidden ||
    !showing() ||
    !canvas.value ||
    !world ||
    !still
  )
    return;
  if (!dirty && last && time - last < 1000 / 30) {
    frame = requestAnimationFrame(paint);
    return;
  }
  const delta = last ? Math.min(0.1, (time - last) / 1000) : 0;
  last = time;
  const ratio = Math.min(devicePixelRatio || 1, 1.5),
    context = layer(canvas.value, ratio);
  if (!context) return;
  const { width, height } = dimensions.value;
  if (worldDirty) {
    const ctx = layer(world, ratio);
    if (ctx) drawWorld(ctx, camera.value);
    worldDirty = false;
  }
  if (dirty) {
    routes = makeRoutes(connections.value, origin.value, camera.value);
    const ctx = layer(still, ratio);
    if (ctx) {
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(world, 0, 0, width, height);
      drawConnections(
        ctx,
        routes,
        highlight.value,
        preferences.showIdle,
        preferences.markerSize,
      );
    }
    farSide.value =
      mode.value === "globe"
        ? routes.filter((route) => !route.node.visible).length
        : 0;
    const exit = origin.value
      ? projectLocation(
          origin.value.longitude,
          origin.value.latitude,
          camera.value,
        )
      : undefined;
    hiddenExit.value =
      !!exit &&
      (!exit.visible ||
        exit.x < 0 ||
        exit.x > width ||
        exit.y < 0 ||
        exit.y > height);
    const valid = new Set(
      routes.flatMap((route) => [
        route.connection.id + ":download",
        route.connection.id + ":upload",
      ]),
    );
    for (const key of phases.keys()) if (!valid.has(key)) phases.delete(key);
    dirty = false;
  }
  const active = moving();
  if (active)
    for (const route of routes)
      for (const direction of ["download", "upload"] as const) {
        const key = route.connection.id + ":" + direction;
        phases.set(
          key,
          ((phases.get(key) ?? 0) +
            delta * trafficVelocity(route.connection[direction])) %
            1,
        );
      }
  context.clearRect(0, 0, width, height);
  context.drawImage(still, 0, 0, width, height);
  drawPackets(
    context,
    routes,
    0,
    highlight.value,
    900,
    phases,
    preferences.markerSize,
  );
  drawOrigin(context, origin.value, camera.value);
  if (active) frame = requestAnimationFrame(paint);
}
function resize() {
  const rect = surface.value?.getBoundingClientRect();
  if (rect && rect.width && rect.height) {
    dimensions.value = {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    schedule(true);
  }
}
function position(event: PointerEvent | WheelEvent) {
  const r = canvas.value!.getBoundingClientRect();
  return { x: event.clientX - r.left, y: event.clientY - r.top };
}
function hits(event: PointerEvent) {
  const point = position(event);
  return peersNearPoint(routes, point.x, point.y);
}
function down(event: PointerEvent) {
  if (event.button !== 0) return;
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    yaw: yaw.value,
    pitch: pitch.value,
    panX: pan.value.x,
    panY: pan.value.y,
    moved: false,
  };
  canvas.value?.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!drag) {
    const peers = hits(event);
    hoveredId.value =
      peers.find((item) => item.id === selectedId.value)?.id ??
      peers[0]?.id ??
      "";
    overlap.value = peers.length;
    return;
  }
  if (event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x,
    dy = event.clientY - drag.y;
  if (Math.hypot(dx, dy) < 4 && !drag.moved) return;
  drag.moved = true;
  if (mode.value === "globe") {
    yaw.value = drag.yaw + dx * 0.3;
    pitch.value = Math.max(-85, Math.min(85, drag.pitch - dy * 0.3));
  } else
    pan.value = clampFlatPan({
      ...camera.value,
      panX: drag.panX + dx,
      panY: drag.panY + dy,
    });
}
function up(event: PointerEvent) {
  if (drag && !drag.moved) {
    const peers = hits(event),
      index = peers.findIndex((item) => item.id === selectedId.value),
      peer = peers[(index + 1) % peers.length];
    if (peer) inspectConnection(peer.id);
  }
  drag = undefined;
}
function zoomBy(amount: number, point?: { x: number; y: number }) {
  const next = zoomCameraAt(camera.value, amount, point);
  zoom.value = next.zoom;
  pan.value = { x: next.panX, y: next.panY };
}
function selectPeer(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  if (id) {
    inspectConnection(id);
    framePeer(id);
  }
}
function framePeer(id: string) {
  const peer = connections.value.find((item) => item.id === id);
  if (!peer || mode.value !== "globe") return;
  const start = origin.value,
    end = peer.location;
  const [lon, lat] = start
    ? geoInterpolate(
        [start.longitude, start.latitude],
        [end.longitude, end.latitude],
      )(0.5)
    : [end.longitude, end.latitude];
  yaw.value = -lon;
  pitch.value = -lat;
  zoom.value = 1;
}
function visibility() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  last = 0;
  if (!document.hidden) schedule();
}
function key(event: KeyboardEvent) {
  if (event.key === "Home") {
    event.preventDefault();
    reset();
  } else if (event.key === "+" || event.key === "=") zoomBy(1.2);
  else if (event.key === "-") zoomBy(0.8);
  else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    if (mode.value === "globe")
      yaw.value += event.key === "ArrowLeft" ? -10 : 10;
    else
      pan.value = clampFlatPan({
        ...camera.value,
        panX: pan.value.x + (event.key === "ArrowLeft" ? -30 : 30),
      });
  }
}
watch(camera, () => schedule(true));
watch(connections, () => {
  if (!connections.value.some((item) => item.id === hoveredId.value))
    hoveredId.value = "";
  schedule();
});
watch(
  [
    highlight,
    () => preferences.showIdle,
    () => preferences.animate,
    () => preferences.markerSize,
  ],
  () => schedule(),
);
watch([() => preferences.view, () => state.expanded], visibility);
watch(
  () => origin.value?.ip,
  () => {
    reset();
    schedule(true);
  },
  { immediate: true },
);
watch(mode, reset);
onMounted(() => {
  world = document.createElement("canvas");
  still = document.createElement("canvas");
  observer = new ResizeObserver(resize);
  if (surface.value) observer.observe(surface.value);
  document.addEventListener("visibilitychange", visibility);
  reduced?.addEventListener("change", visibility);
  resize();
});
onBeforeUnmount(() => {
  disposed = true;
  if (frame) cancelAnimationFrame(frame);
  observer?.disconnect();
  document.removeEventListener("visibilitychange", visibility);
  reduced?.removeEventListener("change", visibility);
  phases.clear();
});
</script>
<template>
  <section class="atlas pane">
    <header class="atlas-header">
      <div class="scope-heading">
        <span class="eyebrow">CONNECTION ATLAS</span>
        <h2 :title="scopeName">{{ scopeName }}</h2>
      </div>
      <div class="atlas-tools">
        <div class="segmented">
          <button
            :class="{ active: mode === 'globe' }"
            @click="preferences.mode = 'globe'"
          >
            Globe</button
          ><button
            :class="{ active: mode === 'flat' }"
            @click="preferences.mode = 'flat'"
          >
            Map
          </button>
        </div>
        <button
          class="icon-button"
          :title="state.expanded ? 'Leave focus view' : 'Expand workspace'"
          :aria-label="
            state.expanded ? 'Collapse workspace' : 'Expand workspace'
          "
          @click="state.expanded = !state.expanded"
        >
          <Icon :name="state.expanded ? 'collapse' : 'expand'" />
        </button>
      </div>
    </header>
    <div class="atlas-scope">
      <button
        class="scope-chip"
        :class="{ active: !state.focusHash }"
        @click="state.focusHash = ''"
      >
        All transfers</button
      ><button
        v-for="torrent in torrents"
        :key="torrent.hash"
        class="scope-chip"
        :class="{ active: state.focusHash === torrent.hash }"
        :title="torrent.name"
        :style="{ '--identity': identity(torrent.hash).color }"
        @click="inspectTorrent(torrent.hash)"
      >
        <Glyph v-bind="identity(torrent.hash)" :size="26" /><span>{{
          torrent.name
        }}</span>
      </button>
    </div>
    <div class="atlas-stats">
      <span><i class="down-dot" />↓ {{ speed(totals.down) }}</span
      ><span><i class="up-dot" />↑ {{ speed(totals.up) }}</span
      ><span class="muted"
        >{{ scopedPeers.length }} connected ·
        {{ connections.length }} mapped</span
      >
    </div>
    <div ref="surface" class="atlas-surface">
      <canvas
        ref="canvas"
        tabindex="0"
        role="img"
        aria-label="Live torrent connection atlas. Drag to rotate or pan, scroll to zoom, Home to reset. Click a peer to pin its inspector."
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="drag = undefined"
        @pointerleave="hoveredId = ''"
        @wheel.prevent="
          zoomBy($event.deltaY < 0 ? 1.12 : 0.89, position($event))
        "
        @keydown="key"
      />
      <div v-if="!preferences.geoEnabled" class="atlas-welcome">
        <div class="orb-icon"><Icon name="globe" :size="38" /></div>
        <h2>A window into your swarm.</h2>
        <p>
          Map your qBittorrent exit and connected peers. IP locations are
          approximate; lookups send public IP addresses to GeoJS.
        </p>
        <button class="button primary" @click="preferences.geoEnabled = true">
          Enable connection atlas
        </button>
      </div>
      <div v-else-if="!origin" class="atlas-message">
        <Icon name="globe" /><span>{{
          state.geoError ||
          (!state.server.last_external_address_v4 && !preferences.originOverride
            ? "Waiting for qBittorrent’s exit address. Set a VPN exit IP in settings if needed."
            : "Locating your exit address…")
        }}</span>
      </div>
      <div v-if="hovered" class="peer-hover">
        <Glyph :color="hovered.color" :shape="hovered.shape" />
        <div>
          <strong>{{ hovered.torrentName }}</strong><span
            >{{ hovered.location.label }} ·
            {{ hovered.seed ? "Seed" : "Peer" }}</span
          ><span
            >↓ {{ speed(hovered.download) }} &nbsp; ↑
            {{ speed(hovered.upload) }}</span
          ><small v-if="overlap > 1"
            >{{ overlap }} peers here · click to cycle</small
          >
        </div>
      </div>
      <button v-else-if="hiddenExit" class="exit-return" @click="reset">
        Bring your exit back into view <Icon name="refresh" :size="14" />
      </button>
      <div class="map-zoom">
        <button aria-label="Zoom in" @click="zoomBy(1.25)">+</button
        ><button aria-label="Zoom out" @click="zoomBy(0.8)">−</button
        ><button @click="reset">Fit</button>
      </div>
    </div>
    <footer class="atlas-footer">
      <div>
        <span
          >{{ mode === "globe" ? "Drag to rotate" : "Drag to pan" }} · Scroll to
          zoom</span
        ><small
          >{{ farSide ? `${farSide} on far side · ` : ""
          }}{{ origin?.ip || "Exit IP pending" }}</small
        >
      </div>
      <div class="map-options">
        <label
          ><input v-model="preferences.showIdle" type="checkbox" />Idle
          routes</label
        ><button
          class="icon-button"
          :aria-label="
            preferences.animate
              ? 'Pause traffic animation'
              : 'Resume traffic animation'
          "
          @click="preferences.animate = !preferences.animate"
        >
          <Icon :name="preferences.animate ? 'pause' : 'play'" :size="15" />
        </button>
      </div>
    </footer>
    <div class="connection-picker">
      <select
        aria-label="Inspect a peer connection"
        :value="selectedId"
        @change="selectPeer"
      >
        <option value="">Choose a connection to inspect…</option>
        <option
          v-if="
            inspectedPeer && !connections.some((peer) => peer.id === selectedId)
          "
          :value="selectedId"
        >
          Pinned · {{ inspectedPeer.peer.ip }}
          {{
            inspectedPeer.connected
              ? "· outside current map filter"
              : "· disconnected"
          }}
        </option>
        <option
          v-for="connection in connections"
          :key="connection.id"
          :value="connection.id"
        >
          {{ connection.torrentName }} · {{ connection.location.label }} ·
          {{ connection.ip }}
        </option></select
      ><span>Natural Earth · GeoJS</span>
    </div>
  </section>
</template>
