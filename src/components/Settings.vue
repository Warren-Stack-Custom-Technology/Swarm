<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import Icon from "./Icon.vue";
import SelectMenu from "./SelectMenu.vue";
import { version as appVersion } from "../../package.json";
import { api } from "../lib/api";
import { bytes } from "../lib/format";
import { preferences } from "../lib/preferences";
import { state, operation, setOrigin, announce } from "../lib/store";
const scales = [
  { value: 0.9, label: "90%" },
  { value: 1, label: "100% · Default" },
  { value: 1.1, label: "110%" },
  { value: 1.25, label: "125%" },
  { value: 1.5, label: "150%" },
];
const emit = defineEmits<{ close: [] }>();
const tab = ref("interface"),
  loading = ref(false),
  error = ref(""),
  exitDraft = ref(preferences.originOverride),
  original = ref<Record<string, unknown>>({}),
  draft = reactive<Record<string, unknown>>({});
const logs = ref<
    { id: number; message: string; timestamp: number; type: number }[]
  >([]),
  feedURL = ref(""),
  rss = ref<Record<string, unknown>>({}),
  plugins = ref<{ name: string; fullName: string; enabled: boolean }[]>([]),
  pattern = ref(""),
  searchPlugin = ref("enabled"),
  searchResults = ref<Record<string, unknown>[]>([]),
  searchRunning = ref(false);
let searchID: number | undefined,
  disposed = false,
  searchGeneration = 0;
const transferFields = [
  ["save_path", "Default save folder", "text"],
  ["temp_path_enabled", "Use incomplete download folder", "checkbox"],
  ["temp_path", "Incomplete download folder", "text"],
  ["preallocate_all", "Preallocate files", "checkbox"],
  ["queueing_enabled", "Enable transfer queue", "checkbox"],
  ["max_active_downloads", "Maximum active downloads", "number"],
  ["max_active_uploads", "Maximum active uploads", "number"],
  ["max_active_torrents", "Maximum active transfers", "number"],
] as const;
const connectionFields = [
  ["listen_port", "Incoming connection port", "number"],
  ["random_port", "Randomize port on startup", "checkbox"],
  ["upnp", "UPnP / NAT-PMP port mapping", "checkbox"],
  ["dht", "DHT discovery", "checkbox"],
  ["pex", "Peer exchange", "checkbox"],
  ["lsd", "Local peer discovery", "checkbox"],
  ["max_connec", "Global connection limit", "number"],
  ["max_connec_per_torrent", "Connections per transfer", "number"],
] as const;
const downLimit = ref(0),
  upLimit = ref(0),
  originalDown = ref(0),
  originalUp = ref(0);
const changes = computed(() =>
  Object.fromEntries(
    Object.entries(draft).filter(
      ([key, value]) => original.value[key] !== value,
    ),
  ),
);
function safeURL(value: unknown) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    if (tab.value === "transfers" || tab.value === "connection") {
      original.value =
        await api.get<Record<string, unknown>>("app/preferences");
      for (const key of Object.keys(draft)) delete draft[key];
      Object.assign(draft, original.value);
      downLimit.value = originalDown.value =
        Number(original.value.dl_limit ?? 0) / 1024;
      upLimit.value = originalUp.value =
        Number(original.value.up_limit ?? 0) / 1024;
    } else if (tab.value === "activity")
      logs.value = await api.get("log/main", {
        normal: true,
        info: true,
        warning: true,
        critical: true,
        last_known_id: -1,
      });
    else if (tab.value === "rss")
      rss.value = await api.get("rss/items", { withData: true });
    else if (tab.value === "search")
      plugins.value = await api.get("search/plugins");
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
function selectTab(value: string) {
  tab.value = value;
  void load();
}
async function save() {
  if (tab.value === "interface") {
    try {
      setOrigin(exitDraft.value.trim());
      emit("close");
    } catch (e) {
      error.value = (e as Error).message;
    }
    return;
  }
  if (
    !Number.isFinite(downLimit.value) ||
    !Number.isFinite(upLimit.value) ||
    downLimit.value < 0 ||
    upLimit.value < 0
  ) {
    error.value = "Speed limits must be zero or greater.";
    return;
  }
  const patch = { ...changes.value };
  if (downLimit.value !== originalDown.value)
    patch.dl_limit = Math.round(downLimit.value * 1024);
  if (upLimit.value !== originalUp.value)
    patch.up_limit = Math.round(upLimit.value * 1024);
  if (!Object.keys(patch).length) {
    announce("No server settings changed");
    return;
  }
  if (
    await operation(
      () => api.post("app/setPreferences", { json: JSON.stringify(patch) }),
      "qBittorrent settings saved",
    )
  )
    await load();
}
function feeds(
  value: Record<string, unknown>,
  prefix = "",
): {
  name: string;
  path: string;
  url: string;
  articles: Record<string, unknown>[];
}[] {
  return Object.entries(value).flatMap(([name, data]) => {
    const path = prefix ? prefix + "\\" + name : name;
    if (typeof data === "string")
      return [{ name, path, url: data, articles: [] }];
    if (data && typeof data === "object") {
      const item = data as Record<string, unknown>;
      if (item.url)
        return [
          {
            name,
            path,
            url: String(item.url),
            articles: Array.isArray(item.articles) ? item.articles : [],
          },
        ];
      return feeds(item, path);
    }
    return [];
  });
}
const feedList = computed(() => feeds(rss.value));
async function addFeed() {
  if (!safeURL(feedURL.value)) {
    error.value = "Enter an HTTP or HTTPS RSS feed URL.";
    return;
  }
  if (
    await operation(
      () => api.post("rss/addFeed", { url: feedURL.value.trim() }),
      "Feed added",
    )
  ) {
    feedURL.value = "";
    await load();
  }
}
async function refreshFeed(path: string) {
  if (
    await operation(
      () => api.post("rss/refreshItem", { itemPath: path }),
      "Feed refreshed",
    )
  )
    await load();
}
async function downloadURL(url: string) {
  await operation(
    () => api.post("torrents/add", { urls: url }),
    "Transfer added",
  );
}
async function runSearch() {
  if (!pattern.value.trim() || searchRunning.value) return;
  const generation = ++searchGeneration;
  searchRunning.value = true;
  error.value = "";
  searchResults.value = [];
  try {
    const result = await api.post<{ id: number }>("search/start", {
      pattern: pattern.value.trim(),
      plugins: searchPlugin.value,
      category: "all",
    });
    if (disposed || generation !== searchGeneration) {
      await api.post("search/stop", { id: result.id });
      return;
    }
    searchID = result.id;
    const id = result.id;
    while (!disposed && generation === searchGeneration) {
      const [status, data] = await Promise.all([
        api.get<{ id: number; status: string }[]>("search/status", { id }),
        api.get<{ results: Record<string, unknown>[] }>("search/results", {
          id,
          limit: 200,
          offset: 0,
        }),
      ]);
      if (generation !== searchGeneration || disposed) break;
      searchResults.value = data.results ?? [];
      if (status[0]?.status !== "Running") break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (e) {
    if (generation === searchGeneration) error.value = (e as Error).message;
  } finally {
    if (generation === searchGeneration) searchRunning.value = false;
  }
}
async function stopSearch() {
  searchGeneration++;
  const id = searchID;
  searchID = undefined;
  searchRunning.value = false;
  try {
    if (id !== undefined) await api.post("search/stop", { id });
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(() => void load());
onBeforeUnmount(() => {
  disposed = true;
  searchGeneration++;
  if (searchRunning.value && searchID !== undefined)
    void api.post("search/stop", { id: searchID }).catch(() => {});
});
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section
      class="modal settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Swarm settings and tools"
    >
      <header>
        <div>
          <span class="eyebrow">SWARM 1.0</span>
          <h2>Settings & tools</h2>
        </div>
        <button
          class="icon-button"
          aria-label="Close settings"
          @click="emit('close')"
        >
          <Icon name="close" />
        </button>
      </header>
      <div class="settings-layout">
        <nav>
          <button
            v-for="item in [
              'interface',
              'transfers',
              'connection',
              'search',
              'rss',
              'activity',
            ]"
            :key="item"
            :class="{ active: tab === item }"
            @click="selectTab(item)"
          >
            {{ item }}
          </button>
        </nav>
        <div class="settings-body">
          <div v-if="error" class="inline-error">{{ error }}</div>
          <div v-if="loading" class="muted">Loading…</div>
          <template v-if="tab === 'interface'"
            ><h3>Display</h3>
            <label class="field"
              >Interface size<SelectMenu
                :model-value="preferences.uiScale"
                :options="scales"
                label="Interface size"
                @update:model-value="preferences.uiScale = Number($event)"
            /></label>
            <label class="field"
              >Traffic shape size
              <div class="marker-size-control">
                <input
                  v-model.number="preferences.markerSize"
                  type="range"
                  min="5"
                  max="10"
                  step="1"
                  aria-label="Traffic shape size"
                /><span>{{
                  preferences.markerSize === 5
                    ? "Compact"
                    : preferences.markerSize >= 9
                      ? "Large"
                      : "Comfortable"
                }}</span>
              </div></label
            >
            <label class="check-field"
              ><input v-model="preferences.vivid" type="checkbox" />Vivid
              identity colours</label
            >
            <div class="option-list">
              <label
                ><input v-model="preferences.animate" type="checkbox" />Animate
                traffic shapes</label
              ><label
                ><input v-model="preferences.showIdle" type="checkbox" />Show
                idle connection routes</label
              ><label
                ><input v-model="preferences.geoEnabled" type="checkbox" />Allow
                GeoJS IP location lookups</label
              >
            </div>
            <p class="muted small-text">
              Only public IP addresses are sent for lookup. Torrent names and
              hashes stay with qBittorrent. Your browser’s public IP is also
              visible to the lookup provider. Locations are approximate.
            </p>
            <label class="field"
              >VPN exit IP override<input
                v-model="exitDraft"
                placeholder="Automatic: qBittorrent-reported address"
            /></label>
            <p class="muted small-text">
              The atlas uses qBittorrent’s reported exit, rather than the
              browser’s address. This is not a VPN protection check.
            </p>
            <div class="about-card">
              <Icon name="globe" :size="26" />
              <div>
                <strong>Swarm · standalone WebUI</strong
                ><span
                  >A direct qBittorrent client. Your torrent engine, files, and
                  VPN stay where they are.</span
                ><small>Vue 3 · d3-geo · Natural Earth · MIT</small>
              </div>
            </div></template
          >
          <template v-else-if="tab === 'transfers' || tab === 'connection'"
            ><h3>
              {{
                tab === "transfers"
                  ? "Transfer defaults"
                  : "Network & discovery"
              }}
            </h3>
            <div class="settings-fields">
              <template
                v-for="[key, label, type] in tab === 'transfers'
                  ? transferFields
                  : connectionFields"
                :key="key"
                ><label
                  v-if="key in original"
                  :class="type === 'checkbox' ? 'check-field' : 'field'"
                  ><input
                    v-if="type === 'checkbox'"
                    v-model="draft[key]"
                    type="checkbox" /><span>{{ label }}</span
                  ><input
                    v-if="type === 'text'"
                    v-model="draft[key]"
                    type="text" /><input
                    v-if="type === 'number'"
                    v-model.number="draft[key]"
                    type="number" /></label
              ></template>
            </div>
            <template v-if="tab === 'transfers'"
              ><h3>Global speed limits</h3>
              <div class="field-pair">
                <label class="field"
                  >Download (KiB/s)<input
                    v-model.number="downLimit"
                    type="number"
                    min="0" /></label
                ><label class="field"
                  >Upload (KiB/s)<input
                    v-model.number="upLimit"
                    type="number"
                    min="0"
                /></label>
              </div>
              <p class="muted small-text">
                0 means unlimited. Only changed settings are sent.
              </p></template
            ><template v-else
              ><dl class="details-grid">
                <dt>Bound interface</dt>
                <dd>
                  {{ original.current_network_interface || "Any interface" }}
                </dd>
                <dt>Bound address</dt>
                <dd>
                  {{ original.current_interface_address || "All addresses" }}
                </dd>
                <dt>qBittorrent</dt>
                <dd>{{ state.version }}</dd>
              </dl>
              <p class="muted small-text">
                Network binding and WebUI authentication remain managed in
                qBittorrent’s desktop settings.
              </p></template
            ></template
          >
          <template v-else-if="tab === 'activity'"
            ><div class="section-header">
              <h3>qBittorrent activity</h3>
              <button class="button compact" @click="load">Refresh</button>
            </div>
            <div
              v-for="log in logs.slice(-250).reverse()"
              :key="log.id"
              class="log-row"
            >
              <small>{{
                new Date(log.timestamp * 1000).toLocaleTimeString()
              }}</small><span>{{ log.message }}</span>
            </div>
            <p v-if="!logs.length" class="muted">
              No activity to show.
            </p></template
          >
          <template v-else-if="tab === 'rss'"
            ><h3>RSS feeds</h3>
            <form class="panel-toolbar" @submit.prevent="addFeed">
              <input
                v-model="feedURL"
                type="url"
                required
                placeholder="Feed URL"
                aria-label="RSS feed URL"
              /><button class="button compact">Add feed</button>
            </form>
            <section v-for="feed in feedList" :key="feed.path" class="feed">
              <div class="section-header">
                <strong>{{ feed.name }}</strong><button
                  class="text-button"
                  @click="refreshFeed(feed.path)"
                >
                  Refresh
                </button>
              </div>
              <small class="break-all muted">{{ feed.url }}</small>
              <article
                v-for="(article, i) in feed.articles.slice(0, 50)"
                :key="String(article.id ?? i)"
              >
                <strong>{{ article.title }}</strong><small>{{
                  article.date
                }}</small
                ><button
                  v-if="article.torrentURL"
                  class="button compact"
                  @click="downloadURL(String(article.torrentURL))"
                >
                  Add transfer</button
                ><a
                  v-if="safeURL(article.link)"
                  :href="safeURL(article.link)"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Open article ↗</a
                >
              </article>
            </section>
            <p v-if="!feedList.length" class="muted">
              No configured feeds. RSS must be enabled in qBittorrent to fetch
              articles. Existing automatic download rules continue to run in
              qBittorrent.
            </p></template
          >
          <template v-else-if="tab === 'search'"
            ><h3>Search plugins</h3>
            <p class="muted small-text">
              Uses the search plugins already installed in qBittorrent.
            </p>
            <form class="panel-toolbar" @submit.prevent="runSearch">
              <input
                v-model="pattern"
                placeholder="Search torrents…"
                aria-label="Search query"
                required
              /><SelectMenu
                :model-value="searchPlugin"
                :options="[
                  { value: 'enabled', label: 'All enabled plugins' },
                  ...plugins.map((plugin) => ({
                    value: plugin.name,
                    label: plugin.fullName,
                  })),
                ]"
                label="Search plugin"
                @update:model-value="searchPlugin = String($event)"
              /><button class="button compact" :disabled="searchRunning">
                Search</button
              ><button
                v-if="searchRunning"
                type="button"
                class="button compact"
                @click="stopSearch"
              >
                Stop
              </button>
            </form>
            <div
              v-for="(result, i) in searchResults"
              :key="i"
              class="search-result"
            >
              <strong>{{ result.fileName }}</strong><span
                >{{ bytes(Number(result.fileSize)) }} ·
                {{ result.nbSeeders }} seeds ·
                {{ result.nbLeechers }} peers</span
              >
              <div>
                <button
                  class="button compact"
                  @click="downloadURL(String(result.fileUrl))"
                >
                  Add transfer</button
                ><a
                  v-if="safeURL(result.descrLink)"
                  :href="safeURL(result.descrLink)"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Details ↗</a
                >
              </div>
            </div>
            <p v-if="!plugins.length" class="muted">
              No plugins are installed, or search is unavailable on this
              qBittorrent instance.
            </p></template
          >
        </div>
      </div>
      <footer>
        <span class="muted small-text"
          >qBittorrent {{ state.version }} · Swarm {{ appVersion }}</span
        ><button
          v-if="['interface', 'transfers', 'connection'].includes(tab)"
          class="button primary"
          :disabled="state.busy || loading"
          @click="save"
        >
          {{ tab === "interface" ? "Done" : "Save changes" }}</button
        ><button v-else class="button" @click="emit('close')">Done</button>
      </footer>
    </section>
  </div>
</template>
