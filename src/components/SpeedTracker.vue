<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { state } from "../lib/store";
import { preferences } from "../lib/preferences";
import { bytes, speed } from "../lib/format";
import { chartData, speedRanges } from "../lib/speedHistory";
import SelectMenu from "./SelectMenu.vue";
import Icon from "./Icon.vue";
const range = ref(0), showDown = ref(true), showUp = ref(true), chartWidth = ref(960);
const panel = ref<HTMLElement>();
const hovered = ref<number>();
const graph = computed(() => chartData(state.history, range.value, state.lastSync || Date.now(), showDown.value, showUp.value, chartWidth.value));
const hoverSample = computed(() => hovered.value === undefined ? undefined : graph.value.samples.reduce<typeof state.history[number] | undefined>((best, point) => !best || Math.abs(point.at - hovered.value!) < Math.abs(best.at - hovered.value!) ? point : best, undefined));
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: graph.value.end - graph.value.start <= 600000 ? "2-digit" : undefined });
const total = (key: string) => state.server[key] === undefined ? "—" : bytes(Number(state.server[key]));
function pointer(event: PointerEvent) {
  const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, ((event.clientX - bounds.left) / bounds.width * chartWidth.value - 80) / (chartWidth.value - 100)));
  hovered.value = graph.value.start + fraction * (graph.value.end - graph.value.start);
}
let observer: ResizeObserver | undefined;
let resizeFrame: number | undefined;
onMounted(() => {
  observer = new ResizeObserver(() => {
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined;
      const bounds = panel.value?.getBoundingClientRect();
      document.documentElement.style.setProperty("--speed-tracker-height", `${bounds?.height || 44}px`);
      chartWidth.value = Math.min(960, Math.max(340, (bounds?.width || 1004) - 44));
    });
  });
  if (panel.value) observer.observe(panel.value);
});
onBeforeUnmount(() => { observer?.disconnect(); if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame); document.documentElement.style.removeProperty("--speed-tracker-height"); });
</script>
<template>
  <section ref="panel" class="speed-tracker" :class="{ 'expanded-workspace': state.expanded }" aria-label="Upload and download tracker">
    <header class="speed-tracker-header">
      <button class="text-button tracker-toggle" :aria-expanded="preferences.speedTrackerOpen" aria-controls="speed-tracker-body" @click="preferences.speedTrackerOpen = !preferences.speedTrackerOpen">
        <Icon name="down" :size="15" :class="{ 'tracker-chevron-open': preferences.speedTrackerOpen }" />Speed & totals
      </button>
      <span class="tracker-current download-text">↓ {{ speed(Number(state.server.dl_info_speed ?? 0)) }}</span>
      <span class="tracker-current upload-text">↑ {{ speed(Number(state.server.up_info_speed ?? 0)) }}</span>
      <span class="tracker-session">Session: ↓ {{ total('dl_info_data') }} · ↑ {{ total('up_info_data') }}</span>
    </header>
    <div v-if="preferences.speedTrackerOpen" id="speed-tracker-body" class="speed-tracker-body">
      <div class="tracker-controls">
        <div class="tracker-legend">
          <button class="text-button download-text" :aria-pressed="showDown" @click="showDown = !showDown"><i :class="{ muted: !showDown }" />Download</button>
          <button class="text-button upload-text" :aria-pressed="showUp" @click="showUp = !showUp"><i :class="{ muted: !showUp }" />Upload</button>
        </div>
        <div class="tracker-hover">{{ hoverSample ? `${clock(hoverSample.at)} · ↓ ${speed(hoverSample.down)} · ↑ ${speed(hoverSample.up)}` : 'All transfers' }}</div>
        <SelectMenu v-model="range" :options="speedRanges" label="Speed graph period" />
      </div>
      <svg class="speed-chart" :viewBox="`0 0 ${chartWidth} 220`" role="img" aria-label="Download and upload speed history" @pointermove="pointer" @pointerleave="hovered = undefined">
        <g v-for="tick in [0, 1, 2, 3, 4]" :key="tick">
          <line x1="80" :x2="chartWidth - 20" :y1="graph.y(graph.maximum * tick / 4)" :y2="graph.y(graph.maximum * tick / 4)" class="chart-grid" />
          <text x="70" :y="graph.y(graph.maximum * tick / 4) + 4" text-anchor="end">{{ speed(graph.maximum * tick / 4) }}</text>
        </g>
        <path v-if="showDown" :d="graph.downloadPath" class="chart-download" />
        <path v-if="showUp" :d="graph.uploadPath" class="chart-upload" />
        <template v-if="hoverSample">
          <line :x1="graph.x(hoverSample.at)" :x2="graph.x(hoverSample.at)" y1="25" y2="185" class="chart-crosshair" />
          <circle v-if="showDown" :cx="graph.x(hoverSample.at)" :cy="graph.y(hoverSample.down)" r="3" class="chart-download-point" />
          <circle v-if="showUp" :cx="graph.x(hoverSample.at)" :cy="graph.y(hoverSample.up)" r="3" class="chart-upload-point" />
        </template>
        <text v-for="tick in [0, 1, 2, 3, 4]" :key="'time' + tick" :x="80 + tick * (chartWidth - 100) / 4" y="210" :text-anchor="tick === 0 ? 'start' : tick === 4 ? 'end' : 'middle'">{{ clock(graph.start + (graph.end - graph.start) * tick / 4) }}</text>
        <text v-if="!graph.samples.length"  :x="chartWidth / 2" y="100" text-anchor="middle">Collecting speed history…</text>
      </svg>
      <div class="tracker-totals">
        <span><strong>This qBittorrent session</strong> <span class="download-text">↓ {{ total('dl_info_data') }}</span> <span class="upload-text">↑ {{ total('up_info_data') }}</span></span>
        <span><strong>All time</strong> <span class="download-text">↓ {{ total('alltime_dl') }}</span> <span class="upload-text">↑ {{ total('alltime_ul') }}</span></span>
      </div>
      <p class="tracker-history-note">Graph history starts when Swarm opens; up to 24 hours retained. Gaps mean no samples were collected.</p>
    </div>
  </section>
</template>
