<script setup lang="ts">
import Glyph from "./Glyph.vue";
import Icon from "./Icon.vue";
import { identity } from "../lib/preferences";
import { state, filtered, inspectTorrent, toggleChecked } from "../lib/store";
import { bytes, speed, percent, stateLabel, duration } from "../lib/format";
defineEmits<{ action: [action: string, hashes: string[]] }>();
function sort(key: string) {
  if (state.sort === key) state.reverse = !state.reverse;
  else {
    state.sort = key;
    state.reverse = key !== "name";
  }
}
</script>
<template>
  <section class="library-table pane">
    <header class="section-header">
      <div>
        <span class="eyebrow">TRANSFER LIBRARY</span>
        <h2>Transfers</h2>
      </div>
      <button class="button" @click="$emit('action', 'add', [])">
        <Icon name="plus" />Add transfer
      </button>
    </header>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="Select all visible transfers"
                :checked="
                  !!filtered.length &&
                  filtered.every((t) => state.checked.includes(t.hash))
                "
                @change="
                  state.checked = ($event.target as HTMLInputElement).checked
                    ? filtered.map((t) => t.hash)
                    : []
                "
              />
            </th>
            <th><button @click="sort('name')">Name</button></th>
            <th>Status</th>
            <th><button @click="sort('progress')">Progress</button></th>
            <th><button @click="sort('size')">Size</button></th>
            <th><button @click="sort('dlspeed')">↓ Download</button></th>
            <th><button @click="sort('upspeed')">↑ Upload</button></th>
            <th><button @click="sort('ratio')">Ratio</button></th>
            <th>ETA</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="torrent in filtered"
            :key="torrent.hash"
            :class="{ selected: state.selectedHash === torrent.hash }"
            @click="inspectTorrent(torrent.hash, false)"
          >
            <td @click.stop>
              <input
                type="checkbox"
                :aria-label="`Select ${torrent.name}`"
                :checked="state.checked.includes(torrent.hash)"
                @change="toggleChecked(torrent.hash)"
              />
            </td>
            <td class="name-cell">
              <Glyph v-bind="identity(torrent.hash)" :size="28" /><span>{{
                torrent.name
              }}</span>
            </td>
            <td>{{ stateLabel(torrent.state) }}</td>
            <td>
              <span>{{ percent(torrent.progress) }}</span>
              <div class="mini-progress">
                <i
                  :style="{
                    width: percent(torrent.progress),
                    background: identity(torrent.hash).color,
                  }"
                />
              </div>
            </td>
            <td>{{ bytes(torrent.size) }}</td>
            <td class="download-text">{{ speed(torrent.dlspeed) }}</td>
            <td class="upload-text">{{ speed(torrent.upspeed) }}</td>
            <td>{{ Number(torrent.ratio || 0).toFixed(2) }}</td>
            <td>{{ duration(torrent.eta) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!filtered.length" class="empty">
        No transfers match this view.
      </div>
    </div>
  </section>
</template>
