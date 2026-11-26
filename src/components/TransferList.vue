<script setup lang="ts">
import { computed } from "vue";
import Icon from "./Icon.vue";
import Glyph from "./Glyph.vue";
import { identity } from "../lib/preferences";
import {
  state,
  filtered,
  torrents,
  inspectTorrent,
  toggleChecked,
} from "../lib/store";
import {
  bytes,
  percent,
  speed,
  stateLabel,
  stopped,
  statusGroup,
} from "../lib/format";
const emit = defineEmits<{ action: [action: string, hashes: string[]] }>();
const filters = [
  ["all", "Everything"],
  ["downloading", "Downloading"],
  ["seeding", "Seeding"],
  ["stopped", "Stopped"],
  ["checking", "Checking"],
  ["active", "Active"],
  ["error", "Needs attention"],
];
const filterCounts = computed(() =>
  Object.fromEntries(
    filters.map(([key]) => [
      key,
      key === "all"
        ? torrents.value.length
        : key === "active"
          ? torrents.value.filter((t) => t.dlspeed + t.upspeed > 0).length
          : torrents.value.filter((t) => statusGroup(t.state) === key).length,
    ]),
  ),
);
</script>
<template>
  <aside class="transfer-list pane">
    <header class="library-header">
      <div>
        <span class="eyebrow">YOUR LIBRARY</span>
        <h2>
          Transfers <small>{{ torrents.length }}</small>
        </h2>
      </div>
      <button
        class="icon-button"
        title="Add transfer"
        aria-label="Add transfer"
        @click="emit('action', 'add', [])"
      >
        <Icon name="plus" />
      </button>
    </header>
    <label class="search-field"
      ><Icon name="search" :size="16" /><input
        v-model="state.search"
        type="search"
        placeholder="Find a transfer…"
        aria-label="Search transfers"
    /></label>
    <div class="library-filters">
      <select v-model="state.status" aria-label="Filter transfer status">
        <option v-for="[key, label] in filters" :key="key" :value="key">
          {{ label }} · {{ filterCounts[key] }}
        </option></select
      ><select v-model="state.sort" aria-label="Sort transfers">
        <option value="added_on">Newest</option>
        <option value="name">Name</option>
        <option value="ratio">Ratio</option>
        <option value="dlspeed">Download</option>
        <option value="upspeed">Upload</option>
        <option value="progress">Progress</option></select
      ><button
        class="icon-button small"
        :aria-label="state.reverse ? 'Sort ascending' : 'Sort descending'"
        @click="state.reverse = !state.reverse"
      >
        <Icon :name="state.reverse ? 'down' : 'up'" :size="14" />
      </button>
    </div>
    <div
      v-if="Object.keys(state.categories).length || state.tags.length"
      class="library-extra-filters"
    >
      <select v-model="state.category" aria-label="Filter category">
        <option value="all">All categories</option>
        <option value="">Uncategorized</option>
        <option
          v-for="category in Object.keys(state.categories)"
          :key="category"
          :value="category"
        >
          {{ category }}
        </option></select
      ><select
        v-if="state.tags.length"
        v-model="state.tag"
        aria-label="Filter tag"
      >
        <option value="all">All tags</option>
        <option v-for="tag in state.tags" :key="tag" :value="tag">
          {{ tag }}
        </option>
      </select>
    </div>
    <div v-if="state.checked.length" class="bulk-bar">
      <strong>{{ state.checked.length }} selected</strong
      ><button
        class="icon-button small"
        aria-label="Start selected"
        @click="emit('action', 'start', state.checked)"
      >
        <Icon name="play" :size="15" /></button
      ><button
        class="icon-button small"
        aria-label="Stop selected"
        @click="emit('action', 'stop', state.checked)"
      >
        <Icon name="pause" :size="15" /></button
      ><button
        class="icon-button small"
        aria-label="Remove selected"
        @click="emit('action', 'remove', state.checked)"
      >
        <Icon name="trash" :size="15" /></button
      ><button
        class="icon-button small"
        aria-label="Clear selection"
        @click="state.checked = []"
      >
        <Icon name="close" :size="15" />
      </button>
    </div>
    <div class="transfer-cards">
      <article
        v-for="torrent in filtered"
        :key="torrent.hash"
        class="transfer-card"
        :class="{
          selected: state.selectedHash === torrent.hash,
          focused: state.focusHash === torrent.hash,
        }"
        :style="{ '--identity': identity(torrent.hash).color }"
        @click="inspectTorrent(torrent.hash)"
      >
        <div class="transfer-top">
          <input
            type="checkbox"
            :aria-label="`Select ${torrent.name}`"
            :checked="state.checked.includes(torrent.hash)"
            @click.stop
            @change="toggleChecked(torrent.hash)"
          /><Glyph v-bind="identity(torrent.hash)" :size="30" /><button
            class="transfer-name"
            :title="torrent.name"
            @click.stop="inspectTorrent(torrent.hash)"
          >
            {{ torrent.name }}</button
          ><button
            class="icon-button small quick-toggle"
            :aria-label="
              (stopped(torrent.state) ? 'Start ' : 'Stop ') + torrent.name
            "
            @click.stop="
              emit('action', stopped(torrent.state) ? 'start' : 'stop', [
                torrent.hash,
              ])
            "
          >
            <Icon
              :name="stopped(torrent.state) ? 'play' : 'pause'"
              :size="14"
            />
          </button>
        </div>
        <div class="progress-track">
          <i
            :style="{
              width: percent(torrent.progress),
              background: identity(torrent.hash).color,
            }"
          />
        </div>
        <div class="transfer-meta">
          <span>{{ stateLabel(torrent.state) }}</span><span>{{
            percent(torrent.progress)
          }}</span>
        </div>
        <div class="transfer-speeds">
          <span class="download-text">↓ {{ speed(torrent.dlspeed) }}</span
          ><span class="upload-text">↑ {{ speed(torrent.upspeed) }}</span>
        </div>
        <div class="transfer-bottom">
          <span>{{ bytes(torrent.size) }}</span><span
            >Ratio {{ Number(torrent.ratio || 0).toFixed(2) }}</span
          >
        </div>
      </article>
      <div v-if="!filtered.length" class="empty">
        <Icon name="folder" :size="30" /><strong>{{
          torrents.length ? "No matches" : "Your library is clear"
        }}</strong
        ><span>{{
          torrents.length
            ? "Try another filter."
            : "Add a magnet or torrent file to begin."
        }}</span>
      </div>
    </div>
    <footer class="library-footer">
      <span>{{ filtered.length }} of {{ torrents.length }} transfers</span
      ><button
        v-if="state.focusHash"
        class="text-button"
        @click="state.focusHash = ''"
      >
        Show all on map
      </button>
    </footer>
  </aside>
</template>
