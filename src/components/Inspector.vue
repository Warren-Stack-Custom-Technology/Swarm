<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "./Icon.vue";
import SelectMenu from "./SelectMenu.vue";
import Glyph from "./Glyph.vue";
import IdentityEditor from "./IdentityEditor.vue";
import { api } from "../lib/api";
import { identity } from "../lib/preferences";
import {
  state,
  selectedTorrent,
  inspectedPeer,
  inspectPeer,
  setTab,
  operation,
  loadDetail,
  focusTorrent,
  closeInspector,
  unpinPeer,
} from "../lib/store";
import {
  bytes,
  speed,
  percent,
  stateLabel,
  duration,
  stopped,
} from "../lib/format";
const ratioPolicy = computed(() => {
  const torrent = selectedTorrent.value;
  if (!torrent) return "Use global limits";
  const rule = Number(torrent.ratio_limit ?? -2);
  if (rule === -1) return "Unlimited ratio";
  if (rule >= 0) return `Ratio ${rule.toFixed(2)}`;
  const effective = Number(torrent.max_ratio ?? -1);
  return effective >= 0 ? `Global ratio ${effective.toFixed(2)}` : "Use global limits";
});
const seedingStatus = computed(() => {
  const torrent = selectedTorrent.value;
  if (!torrent || torrent.progress < 1) return "";
  if (stopped(torrent.state)) return "Seeding is stopped.";
  if (torrent.upspeed > 0) return `Uploading to ${torrent.num_leechs} connected downloader${torrent.num_leechs === 1 ? "" : "s"}.`;
  return torrent.num_leechs > 0 ? "Downloaders are connected; no upload traffic right now." : "Available to seed; no downloaders connected right now.";
});
const priorityOptions = [
  { value: 0, label: "Skip" },
  { value: 1, label: "Normal" },
  { value: 6, label: "High" },
  { value: 7, label: "Maximum" },
];
const allPriorityOptions = [
  { value: "", label: "All files…", disabled: true },
  ...priorityOptions.map((option) => ({
    ...option,
    label: option.value === 0 ? "Skip all" : option.label + " priority",
  })),
];
const emit = defineEmits<{ action: [action: string, hashes: string[]] }>();
const fileSearch = ref(""),
  fileLimit = ref(150),
  peerSearch = ref(""),
  trackerInput = ref(""),
  copied = ref(false);
const files = computed(() =>
  state.detail.hash === state.selectedHash ? state.detail.files : [],
);
const visibleFiles = computed(() =>
  files.value
    .filter((file) =>
      file.name.toLowerCase().includes(fileSearch.value.toLowerCase()),
    )
    .slice(0, fileLimit.value),
);
const peers = computed(() =>
  Object.entries(state.peers[state.selectedHash]?.peers ?? {})
    .map(([key, peer]) => ({ key, peer }))
    .filter(({ peer }) =>
      [peer.ip, peer.client, peer.country ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(peerSearch.value.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.peer.dl_speed + b.peer.up_speed - a.peer.dl_speed - a.peer.up_speed,
    ),
);
const properties = computed(() =>
  state.detail.hash === state.selectedHash ? state.detail.properties : {},
);
watch(
  () => state.selectedHash,
  () => {
    fileSearch.value = "";
    peerSearch.value = "";
    fileLimit.value = 150;
    trackerInput.value = "";
  },
);
async function priority(id: string, value: string | number) {
  if (
    await operation(
      () =>
        api.post("torrents/filePrio", {
          hash: state.selectedHash,
          id,
          priority: Number(value),
        }),
      "File priority updated",
    )
  )
    await loadDetail(true);
}
async function addTrackers() {
  if (!trackerInput.value.trim()) return;
  if (
    await operation(
      () =>
        api.post("torrents/addTrackers", {
          hash: state.selectedHash,
          urls: trackerInput.value.trim(),
        }),
      "Trackers added",
    )
  ) {
    trackerInput.value = "";
    await loadDetail(true);
  }
}
async function removeTracker(url: string) {
  if (!confirm("Remove this tracker?\n" + url)) return;
  if (
    await operation(
      () =>
        api.post("torrents/removeTrackers", {
          hash: state.selectedHash,
          urls: url,
        }),
      "Tracker removed",
    )
  )
    await loadDetail(true);
}
async function copyMagnet() {
  const value =
    selectedTorrent.value?.magnet_uri ||
    `magnet:?xt=urn:btih:${state.selectedHash}`;
  try {
    await navigator.clipboard.writeText(value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    emit("action", "copy", [state.selectedHash]);
  }
}
</script>
<template>
  <aside
    v-show="state.inspectorOpen"
    class="inspector pane"
    aria-label="Transfer inspector"
  >
    <header class="inspector-title">
      <span class="eyebrow">INSPECTOR</span
      ><button
        class="icon-button small"
        aria-label="Close inspector"
        @click="closeInspector"
      >
        <Icon name="close" />
      </button>
    </header>
    <div v-if="selectedTorrent" class="inspector-summary">
      <div class="inspector-name">
        <Glyph v-bind="identity(selectedTorrent.hash)" :size="34" />
        <h2>{{ selectedTorrent.name }}</h2>
      </div>
      <div class="inspector-subtitle">
        <span class="state-badge">{{
          stateLabel(selectedTorrent.state)
        }}</span><span>{{ bytes(selectedTorrent.size) }}</span>
      </div>
      <div class="progress-track">
        <i
          :style="{
            width: percent(selectedTorrent.progress),
            background: identity(selectedTorrent.hash).color,
          }"
        />
      </div>
      <div class="inspector-transfer-metrics">
        <div>
          <span>↓ Download</span
          ><strong>{{ speed(selectedTorrent.dlspeed) }}</strong>
        </div>
        <div>
          <span>↑ Upload</span
          ><strong>{{ speed(selectedTorrent.upspeed) }}</strong>
        </div>
        <div>
          <span>Ratio</span
          ><strong>{{ Number(selectedTorrent.ratio || 0).toFixed(2) }}</strong>
        </div>
      </div>
      <button class="seeding-rule" @click="emit('action', 'limits', [selectedTorrent.hash])">
        <span>Seeding cutoff</span><strong>{{ ratioPolicy }}</strong><Icon name="settings" :size="15" />
      </button>
      <p v-if="seedingStatus" class="seeding-status">{{ seedingStatus }}</p>
      <div class="inspector-actions">
        <button
          class="button compact"
          :disabled="state.busy"
          @click="
            emit('action', stopped(selectedTorrent.state) ? 'start' : 'stop', [
              selectedTorrent.hash,
            ])
          "
        >
          <Icon
            :name="stopped(selectedTorrent.state) ? 'play' : 'pause'"
            :size="15"
          />{{ stopped(selectedTorrent.state) ? "Start" : "Stop" }}</button
        ><button
          class="button compact subtle"
          @click="focusTorrent(selectedTorrent.hash)"
        >
          Focus atlas
        </button>
        <details class="action-menu">
          <summary
            class="button compact subtle"
            aria-label="More transfer actions"
          >
            <Icon name="more" />
          </summary>
          <div>
            <button @click="emit('action', 'rename', [selectedTorrent.hash])">
              Rename transfer</button
            ><button @click="emit('action', 'move', [selectedTorrent.hash])">
              Move files</button
            ><button @click="emit('action', 'limits', [selectedTorrent.hash])">
              Speed & share limits</button
            ><button @click="emit('action', 'labels', [selectedTorrent.hash])">
              Category & tags</button
            ><button @click="emit('action', 'force', [selectedTorrent.hash])">
              Force start</button
            ><button @click="emit('action', 'recheck', [selectedTorrent.hash])">
              Recheck files</button
            ><button
              @click="emit('action', 'reannounce', [selectedTorrent.hash])"
            >
              Reannounce</button
            ><button
              class="danger-text"
              @click="emit('action', 'remove', [selectedTorrent.hash])"
            >
              Remove transfer…
            </button>
          </div>
        </details>
      </div>
    </div>
    <div v-else class="empty">
      <strong>This transfer is no longer in qBittorrent.</strong
      ><span>Your inspector stays pinned until you choose something else.</span>
    </div>
    <div v-if="inspectedPeer" class="pinned-peer">
      <div class="pinned-peer-header">
        <strong
          >{{ inspectedPeer.peer.ip }}:{{ inspectedPeer.peer.port }}</strong
        ><span :class="inspectedPeer.connected ? 'online' : 'muted'">{{
          inspectedPeer.connected ? "Connected" : "Disconnected · last seen"
        }}</span
        ><button
          class="icon-button small"
          aria-label="Unpin peer"
          @click="unpinPeer"
        >
          <Icon name="close" :size="14" />
        </button>
      </div>
      <span
        >{{ inspectedPeer.peer.country || "Location unavailable" }} ·
        {{ inspectedPeer.peer.client || "Unknown client" }}</span
      >
      <div>
        ↓ {{ speed(inspectedPeer.peer.dl_speed) }} &nbsp; ↑
        {{ speed(inspectedPeer.peer.up_speed) }} ·
        {{ percent(inspectedPeer.peer.progress) }} complete
      </div>
    </div>
    <nav class="inspector-tabs" aria-label="Transfer details">
      <button
        v-for="tab in ['overview', 'files', 'peers', 'trackers']"
        :key="tab"
        :class="{ active: state.inspectorTab === tab }"
        @click="setTab(tab)"
      >
        {{ tab }}
      </button>
    </nav>
    <div class="inspector-body">
      <div v-if="state.detail.error" class="inline-error">
        {{ state.detail.error }}
        <button @click="loadDetail(true)">Retry</button>
      </div>
      <section v-if="state.inspectorTab === 'overview' && selectedTorrent">
        <IdentityEditor :hash="selectedTorrent.hash" />
        <dl class="details-grid">
          <dt>Progress</dt>
          <dd>{{ percent(selectedTorrent.progress) }}</dd>
          <dt>Downloaded</dt>
          <dd>{{ bytes(selectedTorrent.downloaded) }}</dd>
          <dt>Uploaded</dt>
          <dd>{{ bytes(selectedTorrent.uploaded) }}</dd>
          <dt>ETA</dt>
          <dd>{{ duration(selectedTorrent.eta) }}</dd>
          <dt>Connected</dt>
          <dd>
            {{ selectedTorrent.num_seeds || 0 }} seeds ·
            {{ selectedTorrent.num_leechs || 0 }} peers
          </dd>
          <dt>Save path</dt>
          <dd class="break-all">{{ selectedTorrent.save_path }}</dd>
          <dt>Category</dt>
          <dd>{{ selectedTorrent.category || "Uncategorized" }}</dd>
          <dt>Tags</dt>
          <dd>{{ selectedTorrent.tags || "None" }}</dd>
          <dt>Added</dt>
          <dd>
            {{ new Date(selectedTorrent.added_on * 1000).toLocaleString() }}
          </dd>
          <dt>Seeded</dt>
          <dd>
            {{
              duration(
                Number(
                  properties.seeding_time ?? selectedTorrent.seeding_time ?? 0,
                ),
              )
            }}
          </dd>
          <dt>Availability</dt>
          <dd>
            {{ properties.availability ?? selectedTorrent.availability ?? "—" }}
          </dd>
          <dt>Hash</dt>
          <dd class="break-all mono">{{ selectedTorrent.hash }}</dd>
        </dl>
        <div class="option-list">
          <label
            ><input
              type="checkbox"
              :checked="!!selectedTorrent.seq_dl"
              @change="
                operation(
                  () =>
                    api.post('torrents/toggleSequentialDownload', {
                      hashes: selectedTorrent!.hash,
                    }),
                  'Sequential download toggled',
                )
              "
            />Sequential download</label
          ><label
            ><input
              type="checkbox"
              :checked="!!selectedTorrent.f_l_piece_prio"
              @change="
                operation(
                  () =>
                    api.post('torrents/toggleFirstLastPiecePrio', {
                      hashes: selectedTorrent!.hash,
                    }),
                  'Piece priority toggled',
                )
              "
            />Prioritize first and last pieces</label
          >
        </div>
        <button class="button full-width" @click="copyMagnet">
          <Icon name="copy" :size="15" />{{
            copied ? "Copied" : "Copy magnet link"
          }}
        </button>
      </section>
      <section v-else-if="state.inspectorTab === 'files'">
        <div class="panel-toolbar">
          <input
            v-model="fileSearch"
            type="search"
            placeholder="Filter file paths…"
            aria-label="Filter files"
          /><SelectMenu
            :model-value="''"
            :options="allPriorityOptions"
            label="Set priority for all files"
            :disabled="state.busy || !files.length"
            @update:model-value="
              priority(files.map((file) => file.index).join('|'), $event)
            "
          />
        </div>
        <div v-for="file in visibleFiles" :key="file.index" class="file-row">
          <span class="file-path">{{ file.name }}</span>
          <div>
            <small>{{ bytes(file.size) }} · {{ percent(file.progress) }}</small
            ><SelectMenu
              :model-value="file.priority"
              :options="priorityOptions"
              :label="`Priority for ${file.name}`"
              :disabled="state.busy"
              @update:model-value="priority(String(file.index), $event)"
            />
          </div>
        </div>
        <button
          v-if="
            visibleFiles.length <
            files.filter((f) =>
              f.name.toLowerCase().includes(fileSearch.toLowerCase()),
            ).length
          "
          class="button full-width"
          @click="fileLimit += 150"
        >
          Show more files
        </button>
        <div v-if="!files.length" class="empty">
          {{
            state.detail.loading
              ? "Loading files…"
              : "No file list available yet."
          }}
        </div>
      </section>
      <section v-else-if="state.inspectorTab === 'peers'">
        <div class="panel-toolbar">
          <input
            v-model="peerSearch"
            type="search"
            placeholder="IP, client, or country…"
            aria-label="Filter peers"
          />
        </div>
        <div
          v-for="{ key, peer } in peers"
          :key="key"
          class="peer-row"
          :class="{
            selected:
              state.pinnedPeer?.key === key &&
              state.pinnedPeer?.hash === state.selectedHash,
          }"
          @click="inspectPeer(state.selectedHash, key, peer)"
        >
          <div>
            <strong class="mono">{{ peer.ip }}</strong><small
              >{{ peer.country || "Unknown location" }} ·
              {{ peer.client || "Unknown client" }}</small
            >
          </div>
          <div>
            <span class="download-text">↓ {{ speed(peer.dl_speed) }}</span
            ><span class="upload-text">↑ {{ speed(peer.up_speed) }}</span>
          </div>
        </div>
        <div v-if="!peers.length" class="empty">
          No connected peers match this filter.
        </div>
        <p class="muted small-text">
          Pin a peer to keep its details visible through live updates and layout
          changes.
        </p>
      </section>
      <section v-else-if="state.inspectorTab === 'trackers'">
        <form class="tracker-add" @submit.prevent="addTrackers">
          <textarea
            v-model="trackerInput"
            rows="2"
            placeholder="Add tracker URLs, one per line"
            aria-label="Tracker URLs"
          /><button
            class="button compact"
            :disabled="state.busy || !trackerInput.trim()"
          >
            Add trackers
          </button>
        </form>
        <div
          v-for="tracker in state.detail.trackers"
          :key="tracker.url"
          class="tracker-row"
        >
          <strong class="break-all">{{ tracker.url }}</strong><span
            >{{
              [
                "Disabled",
                "Not contacted",
                "Working",
                "Updating",
                "Not working",
              ][tracker.status] || "Unknown"
            }}
            · {{ tracker.num_seeds ?? 0 }} seeds ·
            {{ tracker.num_peers ?? 0 }} peers</span
          ><small v-if="tracker.msg">{{ tracker.msg }}</small
          ><button
            v-if="!tracker.url.startsWith('*')"
            class="text-button danger-text"
            :disabled="state.busy"
            @click="removeTracker(tracker.url)"
          >
            Remove
          </button>
        </div>
        <div v-if="!state.detail.trackers.length" class="empty">
          No trackers available yet.
        </div>
      </section>
    </div>
  </aside>
</template>
