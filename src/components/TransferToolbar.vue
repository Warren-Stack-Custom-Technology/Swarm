<script setup lang="ts">
import { computed, ref } from "vue";
import SelectMenu from "./SelectMenu.vue";
import Icon from "./Icon.vue";
import {
  filtered,
  torrents,
  state,
  hasFilters,
  resetFilters,
} from "../lib/store";
withDefaults(defineProps<{ layout?: "sidebar" | "table" }>(), {
  layout: "sidebar",
});
const emit = defineEmits<{ action: [action: string, hashes: string[]] }>();
const filtersOpen = ref(false);
const statuses = [
  { value: "all", label: "All statuses" },
  { value: "downloading", label: "Downloading" },
  { value: "seeding", label: "Seeding" },
  { value: "stopped", label: "Stopped" },
  { value: "checking", label: "Checking files" },
  { value: "active", label: "Active now" },
  { value: "error", label: "Needs attention" },
];
const sorts = [
  { key: "added_on", desc: "Newest first", asc: "Oldest first" },
  { key: "name", desc: "Name Z–A", asc: "Name A–Z" },
  {
    key: "dlspeed",
    desc: "Download: fastest first",
    asc: "Download: slowest first",
  },
  {
    key: "upspeed",
    desc: "Upload: fastest first",
    asc: "Upload: slowest first",
  },
  {
    key: "progress",
    desc: "Progress: highest first",
    asc: "Progress: lowest first",
  },
  { key: "ratio", desc: "Ratio: highest first", asc: "Ratio: lowest first" },
  { key: "size", desc: "Size: largest first", asc: "Size: smallest first" },
].flatMap((sort) => [
  { value: sort.key + ":desc", label: sort.desc },
  { value: sort.key + ":asc", label: sort.asc },
]);
const sorting = computed(
  () => state.sort + ":" + (state.reverse ? "desc" : "asc"),
);
const categories = computed(() => [
  { value: "all", label: "All categories" },
  { value: "", label: "Uncategorized" },
  ...Object.keys(state.categories)
    .sort()
    .map((value) => ({ value, label: value })),
]);
const tags = computed(() => [
  { value: "all", label: "All tags" },
  ...state.tags.map((value) => ({ value, label: value })),
]);
const labelFilterCount = computed(
  () => Number(state.category !== "all") + Number(state.tag !== "all"),
);
const canFilterLabels = computed(
  () =>
    Object.keys(state.categories).length > 0 ||
    state.tags.length > 0 ||
    labelFilterCount.value > 0,
);
const selectedVisible = computed(
  () =>
    filtered.value.filter((torrent) => state.checked.includes(torrent.hash))
      .length,
);
const allSelected = computed(
  () =>
    filtered.value.length > 0 &&
    selectedVisible.value === filtered.value.length,
);
const hiddenSelected = computed(
  () => state.checked.length - selectedVisible.value,
);
function sort(value: string | number) {
  const [key, direction] = String(value).split(":");
  state.sort = key;
  state.reverse = direction === "desc";
}
function selectAll(event: Event) {
  state.checked = (event.target as HTMLInputElement).checked
    ? filtered.value.map((torrent) => torrent.hash)
    : [];
}
</script>
<template>
  <section
    class="transfer-controls"
    :class="layout"
    aria-label="Transfer controls"
  >
    <header class="transfer-controls-heading">
      <label class="select-all" title="Select all visible transfers"
        ><input
          type="checkbox"
          aria-label="Select all visible transfers"
          :checked="allSelected"
          :indeterminate="selectedVisible > 0 && !allSelected"
          :disabled="!filtered.length"
          @change="selectAll"
      /></label>
      <h2>Transfers</h2>
      <span class="match-count">{{
        filtered.length === torrents.length
          ? torrents.length
          : `${filtered.length} / ${torrents.length}`
      }}</span>
    </header>
    <label class="search-field"
      ><Icon name="search" :size="18" /><input
        v-model="state.search"
        type="search"
        placeholder="Find a transfer…"
        aria-label="Search transfers"
        @keydown.esc.stop="state.search = ''"
    /></label>
    <div class="transfer-filter-row">
      <SelectMenu
        :model-value="state.status"
        @update:model-value="state.status = String($event)"
        :options="statuses"
        label="Filter transfer status"
      /><SelectMenu
        v-if="layout === 'sidebar'"
        :model-value="sorting"
        :options="sorts"
        label="Sort transfers"
        compact
        @update:model-value="sort"
      /><button
        v-if="canFilterLabels"
        class="button compact filter-toggle"
        :class="{ active: labelFilterCount > 0 }"
        :aria-expanded="filtersOpen"
        aria-controls="transfer-label-filters"
        @click="filtersOpen = !filtersOpen"
      >
        <Icon name="filter" :size="18" /><span>{{
          labelFilterCount || "Filters"
        }}</span></button
      ><button
        v-if="hasFilters"
        class="text-button reset-filters"
        @click="resetFilters"
      >
        Reset
      </button>
    </div>
    <div
      v-if="filtersOpen && canFilterLabels"
      id="transfer-label-filters"
      class="transfer-label-filters"
    >
      <SelectMenu
        :model-value="state.category"
        @update:model-value="state.category = String($event)"
        :options="categories"
        label="Filter category"
      /><SelectMenu
        v-if="state.tags.length"
        :model-value="state.tag"
        @update:model-value="state.tag = String($event)"
        :options="tags"
        label="Filter tag"
      />
    </div>
    <div v-if="state.checked.length" class="bulk-bar">
      <strong
        >{{ state.checked.length }} selected<small v-if="hiddenSelected">
          · {{ hiddenSelected }} hidden</small
        ></strong
      ><button
        class="icon-button"
        :disabled="state.busy"
        aria-label="Start selected"
        @click="emit('action', 'start', state.checked)"
      >
        <Icon name="play" /></button
      ><button
        class="icon-button"
        :disabled="state.busy"
        aria-label="Stop selected"
        @click="emit('action', 'stop', state.checked)"
      >
        <Icon name="pause" /></button
      ><button
        class="icon-button"
        :disabled="state.busy"
        aria-label="Remove selected"
        @click="emit('action', 'remove', state.checked)"
      >
        <Icon name="trash" /></button
      ><button
        class="icon-button"
        aria-label="Clear selection"
        @click="state.checked = []"
      >
        <Icon name="close" />
      </button>
    </div>
  </section>
</template>
