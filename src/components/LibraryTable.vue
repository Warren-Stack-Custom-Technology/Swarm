<script setup lang="ts">
import Glyph from "./Glyph.vue";
import Icon from "./Icon.vue";
import TransferToolbar from "./TransferToolbar.vue";
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
    <TransferToolbar
      layout="table"
      @action="(action, hashes) => $emit('action', action, hashes)"
    />
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th aria-label="Transfer selection"></th>
            <th
              :aria-sort="
                state.sort === 'name'
                  ? state.reverse
                    ? 'descending'
                    : 'ascending'
                  : 'none'
              "
            >
              <button @click="sort('name')">
                Name<Icon
                  v-if="state.sort === 'name'"
                  :name="state.reverse ? 'down' : 'up'"
                  :size="16"
                />
              </button>
            </th>
            <th>Status</th>
            <th
              :aria-sort="
                state.sort === 'progress'
                  ? state.reverse
                    ? 'descending'
                    : 'ascending'
                  : 'none'
              "
            >
              <button @click="sort('progress')">
                Progress<Icon
                  v-if="state.sort === 'progress'"
                  :name="state.reverse ? 'down' : 'up'"
                  :size="16"
                />
              </button>
            </th>
            <th
              :aria-sort="
                state.sort === 'size'
                  ? state.reverse
                    ? 'descending'
                    : 'ascending'
                  : 'none'
              "
            >
              <button @click="sort('size')">
                Size<Icon
                  v-if="state.sort === 'size'"
                  :name="state.reverse ? 'down' : 'up'"
                  :size="16"
                />
              </button>
            </th>
            <th
              :aria-sort="
                state.sort === 'dlspeed'
                  ? state.reverse
                    ? 'descending'
                    : 'ascending'
                  : 'none'
              "
            >
              <button @click="sort('dlspeed')">
                ↓ Download<Icon
                  v-if="state.sort === 'dlspeed'"
                  :name="state.reverse ? 'down' : 'up'"
                  :size="16"
                />
              </button>
            </th>
            <th
              :aria-sort="
                state.sort === 'upspeed'
                  ? state.reverse
                    ? 'descending'
                    : 'ascending'
                  : 'none'
              "
            >
              <button @click="sort('upspeed')">
                ↑ Upload<Icon
                  v-if="state.sort === 'upspeed'"
                  :name="state.reverse ? 'down' : 'up'"
                  :size="16"
                />
              </button>
            </th>
            <th
              :aria-sort="
                state.sort === 'ratio'
                  ? state.reverse
                    ? 'descending'
                    : 'ascending'
                  : 'none'
              "
            >
              <button @click="sort('ratio')">
                Ratio<Icon
                  v-if="state.sort === 'ratio'"
                  :name="state.reverse ? 'down' : 'up'"
                  :size="16"
                />
              </button>
            </th>
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
              <Glyph v-bind="identity(torrent.hash)" :size="28" /><button
                class="transfer-link"
                @click.stop="inspectTorrent(torrent.hash, false)"
              >
                {{ torrent.name }}
              </button>
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
