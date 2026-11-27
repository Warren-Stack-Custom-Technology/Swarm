<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import Atlas from "./components/Atlas.vue";
import TransferList from "./components/TransferList.vue";
import LibraryTable from "./components/LibraryTable.vue";
import Inspector from "./components/Inspector.vue";
import Settings from "./components/Settings.vue";
import ActionDialog from "./components/ActionDialog.vue";
import Icon from "./components/Icon.vue";
import { api } from "./lib/api";
import { preferences } from "./lib/preferences";
import { state, start, stop, login, operation, connect, closeInspector } from "./lib/store";
import { bytes, speed } from "./lib/format";
const settingsOpen = ref(false),
  dialog = ref<{ action: string; hashes: string[] } | null>(null),
  username = ref(""),
  password = ref("");
const demo = import.meta.env.DEV && import.meta.env.VITE_SWARM_DEMO === "true";
async function action(kind: string, hashes: string[]) {
  document
    .querySelectorAll<HTMLDetailsElement>("details.action-menu[open]")
    .forEach((menu) => (menu.open = false));
  if (kind === "start" || kind === "stop") {
    await operation(
      () => api.transfer(kind, hashes),
      kind === "start" ? "Transfers started" : "Transfers stopped",
    );
    return;
  }
  if (kind === "force") {
    await operation(
      () =>
        api.post("torrents/setForceStart", {
          hashes: hashes.join("|"),
          value: true,
        }),
      "Force start enabled",
    );
    return;
  }
  if (kind === "recheck" || kind === "reannounce") {
    await operation(
      () => api.post("torrents/" + kind, { hashes: hashes.join("|") }),
      kind === "recheck" ? "File recheck requested" : "Reannounce requested",
    );
    return;
  }
  dialog.value = { action: kind, hashes: [...hashes] };
}
async function submitLogin() {
  await login(username.value, password.value);
  password.value = "";
}
function keys(event: KeyboardEvent) {
  if (event.key === "Escape") {
    const menu = document.querySelector<HTMLDetailsElement>(
      "details.action-menu[open]",
    );
    if (menu) {
      menu.open = false;
      event.preventDefault();
      return;
    }
    if ((event.target as HTMLElement)?.tagName === "SELECT") return;
    if (dialog.value && !state.busy) dialog.value = null;
    else if (settingsOpen.value) settingsOpen.value = false;
    else if (state.expanded) state.expanded = false;
    else if (state.inspectorOpen) closeInspector();
    else state.checked = [];
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
    event.preventDefault();
    void action("add", []);
  }
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "f" &&
    state.authenticated &&
    !dialog.value &&
    !settingsOpen.value
  ) {
    const search = document.querySelector<HTMLInputElement>(
      ".search-field input",
    );
    if (search && document.activeElement !== search) {
      event.preventDefault();
      search.focus();
    }
  }
}
watch(
  [settingsOpen, dialog, () => preferences.view, () => state.expanded],
  () => document.dispatchEvent(new Event("swarm:close-menus")),
);
function dismissActionMenus(event: PointerEvent) {
  document
    .querySelectorAll<HTMLDetailsElement>("details.action-menu[open]")
    .forEach((menu) => {
      if (!menu.contains(event.target as Node)) menu.open = false;
    });
}
onMounted(() => {
  start();
  document.addEventListener("pointerdown", dismissActionMenus, true);
  document.addEventListener("keydown", keys);
});
onBeforeUnmount(() => {
  stop();
  document.removeEventListener("pointerdown", dismissActionMenus, true);
  document.removeEventListener("keydown", keys);
});
</script>
<template>
  <div v-if="!state.authenticated" class="login-screen">
    <div class="login-orbit" />
    <form class="login-card" @submit.prevent="submitLogin">
      <img :src="'./swarm-mark-v2.svg'" alt="" width="54" height="54" /><span
        class="eyebrow"
        >SWARM</span
      >
      <h1>Swarm</h1>
      <p>Connect to qBittorrent.</p>
      <div v-if="state.connecting" class="login-connecting">
        Connecting to qBittorrent…
      </div>
      <template v-else
        ><label class="field"
          >Username<input
            v-model="username"
            name="username"
            autocomplete="username"
            autofocus
            required /></label
        ><label class="field"
          >Password<input
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
        /></label>
        <div v-if="state.error" class="inline-error">{{ state.error }}</div>
        <button class="button primary full-width" :disabled="state.connecting">
          Connect to qBittorrent <Icon name="arrow" :size="17" /></button
        ><button class="text-button" type="button" @click="connect">
          Retry existing session
        </button></template
      ><small>Uses your existing qBittorrent WebUI account.</small>
    </form>
  </div>
  <template v-else>
    <header class="app-header">
      <a
        class="brand"
        href="#"
        @click.prevent="
          state.focusHash = '';
          preferences.view = 'atlas';
        "
        ><img :src="'./swarm-mark-v2.svg'" alt="" width="35" height="35" /><span
          >swarm<span class="brand-dot">.</span></span
        ><small>1.0</small></a
      >
      <nav class="app-nav">
        <button
          :class="{ active: preferences.view === 'atlas' }"
          @click="preferences.view = 'atlas'"
        >
          <Icon name="globe" :size="16" />Atlas</button
        ><button
          :class="{ active: preferences.view === 'library' }"
          @click="preferences.view = 'library'"
        >
          <Icon name="list" :size="16" />Library
        </button>
      </nav>
      <div class="header-rate download-text">
        <Icon name="down" :size="16" /><strong>{{
          speed(Number(state.server.dl_info_speed ?? 0))
        }}</strong>
      </div>
      <div class="header-rate upload-text">
        <Icon name="up" :size="16" /><strong>{{
          speed(Number(state.server.up_info_speed ?? 0))
        }}</strong>
      </div>
      <div class="header-actions">
        <button class="button primary" @click="action('add', [])">
          <Icon name="plus" />Add transfer</button
        ><button
          class="icon-button"
          aria-label="Settings and tools"
          title="Settings and tools"
          @click="settingsOpen = true"
        >
          <Icon name="settings" :size="21" />
        </button>
      </div>
    </header>
    <div v-if="demo" class="demo-banner">
      DEMO · Simulated data. No qBittorrent instance is connected.
    </div>
    <div v-if="state.error" class="error-banner" role="alert">
      <Icon name="info" :size="17" /><span
        >{{ state.error }} Existing data remains visible.</span
      ><button class="text-button" @click="connect">Reconnect</button
      ><button
        class="icon-button small"
        aria-label="Dismiss error"
        @click="state.error = ''"
      >
        <Icon name="close" :size="15" />
      </button>
    </div>
    <main
      class="workspace"
      :class="{
        expanded: state.expanded,
        'has-inspector': state.inspectorOpen,
        'table-view': preferences.view === 'library' && !state.expanded,
      }"
    >
      <TransferList
        v-if="preferences.view === 'atlas' && !state.expanded"
        @action="action"
      /><Atlas
        v-show="preferences.view === 'atlas' || state.expanded"
      /><LibraryTable
        v-if="preferences.view === 'library' && !state.expanded"
        @action="action"
      /><Inspector @action="action" />
    </main>
    <footer class="app-footer">
      <div>
        <i
          :class="[
            'connection-dot',
            state.error ||
            state.server.connection_status === 'firewalled' ||
            state.server.connection_status === 'disconnected'
              ? 'warning'
              : '',
          ]"
        /><span>{{
          state.server.connection_status === "firewalled"
            ? "Firewalled"
            : state.server.connection_status === "disconnected"
              ? "Offline"
              : "qBittorrent connected"
        }}</span
        ><span class="footer-separator">·</span
        ><span
          >{{ bytes(Number(state.server.free_space_on_disk ?? 0)) }} free</span
        >
      </div>
      <div>
        <span class="muted">qBittorrent {{ state.version }}</span>
      </div>
    </footer>
  </template>
  <div v-if="state.notice" class="toast" role="status">
    <Icon name="check" :size="17" />{{ state.notice }}
  </div>
  <Settings v-if="settingsOpen" @close="settingsOpen = false" /><ActionDialog
    v-if="dialog"
    :key="dialog.action + dialog.hashes.join()"
    :action="dialog.action"
    :hashes="dialog.hashes"
    @close="dialog = null"
  />
</template>
