<script setup lang="ts">
import Icon from "./Icon.vue";
import Glyph from "./Glyph.vue";
import TransferToolbar from "./TransferToolbar.vue";
import { identity } from "../lib/preferences";
import {
  state,
  filtered,
  torrents,
  inspectTorrent,
  toggleChecked,
} from "../lib/store";
import { bytes, percent, speed, stateLabel, stopped } from "../lib/format";
const emit = defineEmits<{ action: [action: string, hashes: string[]] }>();
</script>
<template>
  <aside class="transfer-list pane">
    <TransferToolbar
      @action="(action, hashes) => emit('action', action, hashes)"
    />
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
        <div class="transfer-ratio-row">
          <span>{{ bytes(torrent.size) }}</span><span
            >Ratio
            <strong>{{ Number(torrent.ratio || 0).toFixed(2) }}</strong></span
          >
        </div>
        <div class="transfer-speeds">
          <span class="download-text">↓ {{ speed(torrent.dlspeed) }}</span
          ><span class="upload-text">↑ {{ speed(torrent.upspeed) }}</span>
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
  </aside>
</template>
