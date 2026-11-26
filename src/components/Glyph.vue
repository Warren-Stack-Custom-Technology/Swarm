<script setup lang="ts">
import { SHAPE_PATHS } from "../lib/identity";
import type { TorrentShape } from "../lib/identity";
withDefaults(
  defineProps<{ color: string; shape: TorrentShape; size?: number }>(),
  { size: 28 },
);
</script>
<template>
  <svg
    :width="size"
    :height="size"
    :style="{
      width: `calc(${size}px * var(--ui-scale, 1))`,
      height: `calc(${size}px * var(--ui-scale, 1))`,
    }"
    viewBox="-9 -9 18 18"
    aria-hidden="true"
    class="glyph"
  >
    <path
      :d="SHAPE_PATHS[shape]"
      :fill="color"
      stroke="#080808"
      stroke-width=".55"
    />
  </svg>
</template>
