<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  chevron: "M6 9l6 6 6-6",
  sort: "M4 6h16M4 12h11M4 18h6M18 12v9M15 18l3 3 3-3",
  plus: "M12 5v14M5 12h14",
  play: "M8 5l12 7-12 7z",
  pause: "M8 5v14M16 5v14",
  close: "M6 6l12 12M6 18L18 6",
  search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-6 6-6 12 0 18M12 3c6 6 6 12 0 18",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
  settings:
    "M9.13 5.07L10.06 4.76L9.92 2.22L14.08 2.22L13.94 4.76L14.87 5.07L14.87 5.07L15.75 5.50L17.45 3.61L20.39 6.55L18.50 8.25L18.93 9.13L18.93 9.13L19.24 10.06L21.78 9.92L21.78 14.08L19.24 13.94L18.93 14.87L18.93 14.87L18.50 15.75L20.39 17.45L17.45 20.39L15.75 18.50L14.87 18.93L14.87 18.93L13.94 19.24L14.08 21.78L9.92 21.78L10.06 19.24L9.13 18.93L9.13 18.93L8.25 18.50L6.55 20.39L3.61 17.45L5.50 15.75L5.07 14.87L5.07 14.87L4.76 13.94L2.22 14.08L2.22 9.92L4.76 10.06L5.07 9.13L5.07 9.13L5.50 8.25L3.61 6.55L6.55 3.61L8.25 5.50L9.13 5.07ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  down: "M12 3v17M5 13l7 7 7-7",
  up: "M12 21V4M5 11l7-7 7 7",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  refresh: "M20 7V3l-4 4M20 7a8 8 0 1 0 0 10",
  expand: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5",
  collapse: "M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5",
  folder: "M3 7V4h6l2 3h10v13H3z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  check: "M4 12l5 5L20 6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  logout: "M9 3H3v18h6M12 12h10M17 7l5 5-5 5",
  info: "M12 11v7M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  copy: "M8 8h13v13H8zM3 16V3h13",
  rss: "M5 19h.01M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16",
  bolt: "M13 2L4 14h7l-1 8 10-13h-7z",
  file: "M5 2h9l5 5v15H5zM14 2v6h5",
  shield: "M12 2l9 4v6c0 6-9 10-9 10S3 18 3 12V6z",
  filter: "M3 4h18l-7 8v8l-4-2v-6z",
};
</script>
<template>
  <svg
    :width="size"
    :height="size"
    :style="{
      width: `calc(${size}px * var(--ui-scale, 1))`,
      height: `calc(${size}px * var(--ui-scale, 1))`,
    }"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.info" />
  </svg>
</template>
