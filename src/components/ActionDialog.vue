<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Icon from "./Icon.vue";
import { api } from "../lib/api";
import { state, operation, announce, loadDetail } from "../lib/store";
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
  down = ref(0),
  up = ref(0),
  ratio = ref(-1),
  seedMinutes = ref(-1),
  idleMinutes = ref(-1),
  files = ref<File[]>([]),
  error = ref("");
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
  down.value = Math.max(0, Number(one.value?.dl_limit ?? 0)) / 1024;
  up.value = Math.max(0, Number(one.value?.up_limit ?? 0)) / 1024;
  ratio.value = Number(one.value?.ratio_limit ?? -1);
  seedMinutes.value = Number(one.value?.seeding_time_limit ?? -1);
  idleMinutes.value = Number(one.value?.inactive_seeding_time_limit ?? -1);
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
          state.inspectorOpen = false;
          state.selectedHash = "";
          state.pinnedPeer = null;
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
        if (
          [down.value, up.value].some(
            (number) => !Number.isFinite(number) || number < 0,
          )
        )
          throw new Error("Speed limits must be zero or greater.");
        await api.post("torrents/setDownloadLimit", {
          hashes,
          limit: Math.round(down.value * 1024),
        });
        await api.post("torrents/setUploadLimit", {
          hashes,
          limit: Math.round(up.value * 1024),
        });
        await api.post("torrents/setShareLimits", {
          hashes,
          ratioLimit: ratio.value,
          seedingTimeLimit: seedMinutes.value,
          inactiveSeedingTimeLimit: idleMinutes.value,
        });
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
                  step="1" /></label
              ><label class="field"
                >Upload limit (KiB/s)<input
                  v-model.number="up"
                  type="number"
                  min="0"
                  step="1"
              /></label>
            </div>
            <p class="muted small-text">0 means unlimited.</p>
            <label class="field"
              >Share ratio limit<input
                v-model.number="ratio"
                type="number"
                min="-2"
                step=".1"
            /></label>
            <div class="field-pair">
              <label class="field"
                >Seeding limit (minutes)<input
                  v-model.number="seedMinutes"
                  type="number"
                  min="-2"
                  step="1" /></label
              ><label class="field"
                >Inactive seeding (minutes)<input
                  v-model.number="idleMinutes"
                  type="number"
                  min="-2"
                  step="1"
              /></label>
            </div>
            <p class="muted small-text">
              Share limits: −1 means unlimited, −2 uses qBittorrent’s global
              limit.
            </p></template
          >
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
