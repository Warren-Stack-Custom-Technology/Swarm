<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import Icon from "./Icon.vue";
import LimitChoice from "./LimitChoice.vue";
import { commonLimit, shareLimitRequests, type LimitDraft, type LimitField } from "../lib/shareLimits";
import { api } from "../lib/api";
import { state, operation, announce, loadDetail, closeInspector } from "../lib/store";
const props = defineProps<{ action: string; hashes: string[] }>();
const emit = defineEmits<{ close: [] }>();
const selected = computed(() =>
  props.hashes.map((hash) => state.torrents[hash]).filter(Boolean),
);
const one = computed(() => selected.value[0]);
const title = computed(
  () =>
    ({
      add: "Add a transfer",
      remove: "Remove transfers",
      rename: "Rename transfer",
      move: "Move downloaded files",
      limits: "Transfer limits",
      labels: "Category & tags",
      copy: "Magnet link",
    })[props.action] ?? "Transfer action",
);
const urls = ref(""),
  savePath = ref(""),
  category = ref(""),
  tags = ref(""),
  startStopped = ref(false),
  sequential = ref(false),
  deleteFiles = ref(false),
  value = ref(""),
  down = ref<number | string>(0),
  up = ref<number | string>(0),
  files = ref<File[]>([]),
  error = ref("");
const limits = reactive<LimitDraft>({ ratio_limit: -2, seeding_time_limit: -2, inactive_seeding_time_limit: -2 });
let initialLimits: LimitDraft = { ...limits };
let originalDown: number | string = 0, originalUp: number | string = 0;
const globalLimits = ref<Record<string, unknown>>({});
const globalsReady = ref(false);
function globalLabel(key: LimitField) {
  if (!globalsReady.value) return "Uses qBittorrent’s global setting.";
  const field = key === "ratio_limit" ? "max_ratio" : key === "seeding_time_limit" ? "max_seeding_time" : "max_inactive_seeding_time";
  const limit = Number(globalLimits.value[field] ?? -1);
  return globalLimits.value[field + "_enabled"] === false || limit < 0 ? "Global setting: unlimited." : key === "ratio_limit" ? `Global ratio: ${limit.toFixed(2)}.` : `Global setting: ${limit} minutes.`;
}
function commonSpeed(key: "dl_limit" | "up_limit") {
  const values = selected.value.map(torrent => Math.max(0, Number(torrent[key] ?? 0)) / 1024);
  return values.every(value => value === values[0]) ? (values[0] ?? 0) : "";
}
onMounted(() => {
  value.value =
    props.action === "rename"
      ? (one.value?.name ?? "")
      : props.action === "copy"
        ? one.value?.magnet_uri || "magnet:?xt=urn:btih:" + props.hashes[0]
        : "";
  savePath.value = one.value?.save_path ?? "";
  category.value = one.value?.category ?? "";
  tags.value = one.value?.tags ?? "";
  down.value = originalDown = commonSpeed("dl_limit");
  up.value = originalUp = commonSpeed("up_limit");
  for (const key of Object.keys(limits) as LimitField[]) limits[key] = commonLimit(selected.value, key);
  initialLimits = { ...limits };
  if (props.action === "limits") void api.get<Record<string, unknown>>("app/preferences").then(prefs => {
    globalLimits.value = prefs; globalsReady.value = true;
  }).catch(() => { /* Choices remain usable when global settings cannot be read. */ });
});
async function submit() {
  error.value = "";
  if (props.action === "copy") {
    try {
      await navigator.clipboard.writeText(value.value);
      announce("Magnet copied");
    } catch {
      error.value = "Select and copy the link manually.";
    }
    return;
  }
  const success = await operation(
    async () => {
      const hashes = props.hashes.join("|");
      if (
        props.action !== "add" &&
        props.action !== "copy" &&
        !props.hashes.length
      )
        throw new Error("Select a transfer first.");
      if (props.action === "add") {
        if (!urls.value.trim() && !files.value.length)
          throw new Error("Add a magnet, URL, or torrent file.");
        const form = new FormData();
        if (urls.value.trim()) form.append("urls", urls.value.trim());
        for (const file of files.value)
          form.append("torrents", file, file.name);
        if (savePath.value.trim())
          form.append("savepath", savePath.value.trim());
        if (category.value) form.append("category", category.value);
        if (tags.value.trim()) form.append("tags", tags.value.trim());
        form.append("sequentialDownload", String(sequential.value));
        form.append(
          parseInt(api.version.replace(/^v/, "")) >= 5 ? "stopped" : "paused",
          String(startStopped.value),
        );
        await api.post("torrents/add", {}, form);
      } else if (props.action === "remove") {
        await api.post("torrents/delete", {
          hashes,
          deleteFiles: deleteFiles.value,
        });
        if (props.hashes.includes(state.selectedHash)) {
          closeInspector();
        }
      } else if (props.action === "rename") {
        if (!value.value.trim()) throw new Error("Enter a name.");
        await api.post("torrents/rename", {
          hash: props.hashes[0],
          name: value.value.trim(),
        });
      } else if (props.action === "move") {
        if (!savePath.value.trim())
          throw new Error("Enter a destination path.");
        await api.post("torrents/setLocation", {
          hashes,
          location: savePath.value.trim(),
        });
      } else if (props.action === "limits") {
        const requests = shareLimitRequests(selected.value, limits, initialLimits);
        const speeds = [[down.value, originalDown, "torrents/setDownloadLimit"], [up.value, originalUp, "torrents/setUploadLimit"]] as const;
        for (const [value] of speeds) {
          if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))
            throw new Error("Speed limits must be zero or greater.");
        }
        // Apply only edited fields. Preserve each selected torrent’s other limits and action.
        for (const request of requests) await api.post("torrents/setShareLimits", request);
        for (const [value, original, endpoint] of speeds) {
          if (value !== "" && value !== original)
            await api.post(endpoint, { hashes, limit: Math.round(Number(value) * 1024) });
        }
      } else if (props.action === "labels") {
        if (category.value && !state.categories[category.value])
          await api.post("torrents/createCategory", {
            category: category.value,
            savePath: "",
          });
        await api.post("torrents/setCategory", {
          hashes,
          category: category.value,
        });
        // qBittorrent removes all tags when the tags argument is empty.
        await api.post("torrents/removeTags", { hashes, tags: "" });
        if (tags.value.trim())
          await api.post("torrents/addTags", {
            hashes,
            tags: tags.value.trim(),
          });
      }
    },
    props.action === "remove"
      ? deleteFiles.value
        ? "Transfers and downloaded files removed"
        : "Transfers removed; downloaded files kept"
      : "Transfer updated",
  );
  if (success) {
    void loadDetail(true);
    emit("close");
  } else error.value = state.error;
}
</script>
<template>
  <div class="modal-backdrop" @click.self="!state.busy && emit('close')">
    <section class="modal" role="dialog" aria-modal="true" :aria-label="title">
      <header>
        <div>
          <span class="eyebrow">SWARM</span>
          <h2>{{ title }}</h2>
        </div>
        <button
          class="icon-button"
          aria-label="Close dialog"
          :disabled="state.busy"
          @click="emit('close')"
        >
          <Icon name="close" />
        </button>
      </header>
      <form @submit.prevent="submit">
        <div class="modal-body">
          <template v-if="action === 'add'"
            ><label class="field"
              >Magnet links or torrent URLs<textarea
                v-model="urls"
                rows="4"
                autofocus
                placeholder="magnet:?xt=urn:btih:…"
              /></label
            ><label class="upload-drop"
              ><Icon name="file" /><span>{{
                files.length
                  ? `${files.length} torrent file(s) selected`
                  : "Or choose .torrent files"
              }}</span
              ><input
                type="file"
                accept=".torrent,application/x-bittorrent"
                multiple
                @change="
                  files = Array.from(
                    ($event.target as HTMLInputElement).files ?? [],
                  )
                " /></label
            ><label class="field"
              >Save path <small>Leave blank to use qBittorrent’s default</small
              ><input v-model="savePath" placeholder="Default download folder"
            /></label>
            <div class="field-pair">
              <label class="field">Category<input v-model="category" /></label
              ><label class="field"
                >Tags<input v-model="tags" placeholder="Comma separated"
              /></label>
            </div>
            <div class="option-list">
              <label
                ><input v-model="startStopped" type="checkbox" />Add
                stopped</label
              ><label
                ><input v-model="sequential" type="checkbox" />Sequential
                download</label
              >
            </div></template
          >
          <template v-else-if="action === 'remove'"
            ><p>
              Remove {{ selected.length }} transfer{{
                selected.length === 1 ? "" : "s"
              }}
              from qBittorrent?
            </p>
            <ul class="remove-list">
              <li v-for="torrent in selected" :key="torrent.hash">
                {{ torrent.name }}
              </li>
            </ul>
            <label class="destructive-choice"
              ><input v-model="deleteFiles" type="checkbox" /><span
                ><strong>Also delete downloaded files</strong
                ><small v-if="deleteFiles"
                  >This deletes the selected transfers’ files from disk.</small
                ><small v-else>Downloaded files will stay on disk.</small></span
              ></label
            ></template
          >
          <label v-else-if="action === 'rename'" class="field"
            >Transfer name<input v-model="value" autofocus required
          /></label>
          <template v-else-if="action === 'move'"
            ><p class="muted">
              qBittorrent will move these transfers’ files to the destination
              below.
            </p>
            <label class="field"
              >Destination folder<input
                v-model="savePath"
                autofocus
                required /></label
          ></template>
          <template v-else-if="action === 'limits'"
            ><div class="field-pair">
              <label class="field"
                >Download limit (KiB/s)<input
                  v-model.number="down"
                  type="number"
                  min="0"
                  step="any" /></label
              ><label class="field"
                >Upload limit (KiB/s)<input
                  v-model.number="up"
                  type="number"
                  min="0"
                  step="any"
              /></label>
            </div>
            <p class="muted small-text">Speed limits: 0 means unlimited.<span v-if="selected.length > 1"> Leave a speed blank to keep each transfer’s current limit.</span></p>
            <div class="seeding-limit-heading">
              <h3>Seeding limits</h3>
              <button type="button" class="text-button" :disabled="state.busy" @click="limits.ratio_limit = -2; limits.seeding_time_limit = -2; limits.inactive_seeding_time_limit = -2">Use global for all</button>
            </div>
            <p v-if="selected.length === 1" class="muted small-text">Current share ratio: {{ Number(one?.ratio ?? 0).toFixed(2) }}</p>
            <LimitChoice v-model="limits.ratio_limit" label="Share ratio" ratio :global-label="globalLabel('ratio_limit')" :mixed="selected.length > 1" :disabled="state.busy" />
            <div class="field-pair">
              <LimitChoice v-model="limits.seeding_time_limit" label="Seeding time" :global-label="globalLabel('seeding_time_limit')" :mixed="selected.length > 1" :disabled="state.busy" />
              <LimitChoice v-model="limits.inactive_seeding_time_limit" label="Inactive seeding time" :global-label="globalLabel('inactive_seeding_time_limit')" :mixed="selected.length > 1" :disabled="state.busy" />
            </div>
            <p class="muted small-text">{{ selected.length > 1 ? 'Each transfer keeps its existing action when a limit is reached.' : one?.share_limit_action === 'Stop' ? 'When a limit is reached: stop seeding.' : one?.share_limit_action && one.share_limit_action !== 'Default' ? 'The existing action when a limit is reached is preserved.' : globalsReady && Number(globalLimits.max_ratio_act) === 0 ? 'Global action when a limit is reached: stop seeding.' : 'The global action when a limit is reached is preserved.' }}</p>
          </template>
          <template v-else-if="action === 'labels'"
            ><label class="field"
              >Category<input
                v-model="category"
                placeholder="Uncategorized" /></label
            ><label class="field"
              >Tags<input v-model="tags" placeholder="Comma separated" /></label
          ></template>
          <label v-else-if="action === 'copy'" class="field"
            >Magnet link<textarea
              v-model="value"
              rows="4"
              readonly
              @focus="($event.target as HTMLTextAreaElement).select()"
            />
          </label>
          <div v-if="error" class="inline-error">{{ error }}</div>
        </div>
        <footer>
          <button
            type="button"
            class="button subtle"
            :disabled="state.busy"
            @click="emit('close')"
          >
            Cancel</button
          ><button
            class="button"
            :class="action === 'remove' ? 'danger' : 'primary'"
            :disabled="state.busy"
          >
            {{
              state.busy
                ? "Working…"
                : action === "remove"
                  ? deleteFiles
                    ? "Delete transfer & files"
                    : "Remove transfer"
                  : action === "add"
                    ? "Add transfer"
                    : action === "copy"
                      ? "Copy link"
                      : "Save changes"
            }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>
