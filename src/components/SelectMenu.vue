<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import Glyph from "./Glyph.vue";
import Icon from "./Icon.vue";
import type { TorrentShape } from "../lib/identity";

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  color?: string;
  shape?: TorrentShape;
}
const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    options: SelectOption[];
    label: string;
    placeholder?: string;
    searchable?: boolean;
    disabled?: boolean;
    compact?: boolean;
    icon?: string;
  }>(),
  {
    placeholder: "Choose…",
    searchable: false,
    disabled: false,
    compact: false,
    icon: "sort",
  },
);
const emit = defineEmits<{ "update:modelValue": [value: string | number] }>();
const trigger = ref<HTMLButtonElement>(),
  panel = ref<HTMLDivElement>(),
  searchInput = ref<HTMLInputElement>(),
  list = ref<HTMLUListElement>();
const open = ref(false),
  query = ref(""),
  activeValue = ref<string | number>();
const position = ref<Record<string, string>>({});
const id = "select-" + useId();
const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
const matching = computed(() =>
  props.options.filter((option) =>
    option.label
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const shown = computed(() => {
  const visible = matching.value.slice(0, 200),
    current = matching.value.find(
      (option) => option.value === props.modelValue,
    );
  return current && !visible.includes(current)
    ? [current, ...visible.slice(0, 199)]
    : visible;
});
const activeIndex = computed(() =>
  shown.value.findIndex((option) => option.value === activeValue.value),
);
const activeId = computed(() =>
  !open.value || activeIndex.value < 0
    ? undefined
    : `${id}-${activeIndex.value}`,
);
let typeahead = "",
  typedAt = 0;
let observer: ResizeObserver | undefined;
function place() {
  if (!open.value || !trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 12,
    above = rect.top - 12;
  const upwards = below < 220 && above > below;
  const width = Math.min(
    Math.max(rect.width, 240),
    Math.min(600, window.innerWidth - 24),
  );
  position.value = {
    position: "fixed",
    left:
      Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + "px",
    width: width + "px",
    maxHeight: Math.max(100, Math.min(420, upwards ? above : below)) + "px",
    ...(upwards
      ? { bottom: window.innerHeight - rect.top + 6 + "px" }
      : { top: rect.bottom + 6 + "px" }),
  };
}
function scrollActive() {
  nextTick(() =>
    panel.value
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" }),
  );
}
async function show() {
  if (props.disabled || open.value) return;
  query.value = "";
  open.value = true;
  activeValue.value = props.modelValue;
  place();
  await nextTick();
  if (activeIndex.value < 0)
    activeValue.value = shown.value.find((option) => !option.disabled)?.value;
  (props.searchable ? searchInput.value : list.value)?.focus();
  scrollActive();
}
function close(restoreFocus = false) {
  open.value = false;
  query.value = "";
  if (restoreFocus) nextTick(() => trigger.value?.focus());
}
function choose(option: SelectOption) {
  if (option.disabled) return;
  emit("update:modelValue", option.value);
  close(true);
}
function step(direction: number) {
  const count = shown.value.length;
  if (!count) return;
  let index = activeIndex.value;
  for (let attempts = 0; attempts < count; attempts++) {
    index = (index + direction + count) % count;
    if (!shown.value[index].disabled) {
      activeValue.value = shown.value[index].value;
      scrollActive();
      return;
    }
  }
}
function key(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  if (event.key === "Tab") {
    close();
    trigger.value?.focus();
    return;
  }
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    if (!open.value) void show();
    else step(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (!open.value) return;
  if (
    event.key === "Enter" ||
    (event.key === " " && event.target !== searchInput.value)
  ) {
    event.preventDefault();
    event.stopPropagation();
    const option = shown.value[activeIndex.value];
    if (option) choose(option);
    return;
  }
  if (event.target === searchInput.value) return;
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    const enabled = shown.value.filter((option) => !option.disabled);
    activeValue.value = (event.key === "Home" ? enabled[0] : enabled.at(-1))
      ?.value;
    scrollActive();
    return;
  }
  if (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    const now = Date.now();
    typeahead = now - typedAt < 700 ? typeahead + event.key : event.key;
    typedAt = now;
    const option = shown.value.find(
      (option) =>
        !option.disabled &&
        option.label
          .toLocaleLowerCase()
          .startsWith(typeahead.toLocaleLowerCase()),
    );
    if (option) {
      activeValue.value = option.value;
      scrollActive();
    }
    event.preventDefault();
  }
}
function outside(event: PointerEvent) {
  const target = event.target as Node;
  if (
    open.value &&
    !trigger.value?.contains(target) &&
    !panel.value?.contains(target)
  )
    close();
}
function closeAll() {
  close();
}
watch(shown, () => {
  if (open.value && activeIndex.value < 0)
    activeValue.value = shown.value.find((option) => !option.disabled)?.value;
});
watch(
  () => props.disabled,
  (value) => {
    if (value) close();
  },
);
onMounted(() => {
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("swarm:close-menus", closeAll);
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  observer = new ResizeObserver(place);
  if (trigger.value) observer.observe(trigger.value);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("swarm:close-menus", closeAll);
  window.removeEventListener("resize", place);
  window.removeEventListener("scroll", place, true);
  observer?.disconnect();
});
</script>
<template>
  <div class="select-menu" :class="{ open, disabled }">
    <button
      ref="trigger"
      type="button"
      class="select-trigger"
      :class="{ compact }"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="id"
      :aria-activedescendant="activeId"
      :disabled="disabled"
      :title="selected?.label"
      @click="open ? close() : show()"
      @keydown="key"
    >
      <Icon v-if="compact" :name="icon" :size="20" />
      <template v-else
        ><Glyph
          v-if="selected?.shape && selected?.color"
          :shape="selected.shape"
          :color="selected.color"
          :size="24" /><span>{{ selected?.label || placeholder }}</span
        ><Icon name="chevron" :size="18"
      /></template>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="select-popover"
        :style="position"
        @keydown="key"
      >
        <input
          v-if="searchable"
          ref="searchInput"
          v-model="query"
          class="select-search"
          type="search"
          :aria-label="`Search ${label.toLowerCase()}`"
          :aria-controls="id"
          :aria-activedescendant="activeId"
          autocomplete="off"
          placeholder="Type to filter…"
        />
        <ul
          :id="id"
          ref="list"
          role="listbox"
          :aria-label="label"
          tabindex="-1"
          :aria-activedescendant="activeId"
        >
          <li
            v-for="(option, index) in shown"
            :id="`${id}-${index}`"
            :key="option.value"
            role="option"
            :aria-selected="option.value === modelValue"
            :aria-disabled="!!option.disabled"
            :data-active="option.value === activeValue"
            @pointermove="activeValue = option.value"
            @click="choose(option)"
          >
            <Glyph
              v-if="option.shape && option.color"
              :shape="option.shape"
              :color="option.color"
              :size="26"
            /><span>{{ option.label }}</span
            ><Icon v-if="option.value === modelValue" name="check" :size="18" />
          </li>
          <li v-if="!shown.length" class="select-empty" role="presentation">
            No matches
          </li>
        </ul>
        <div v-if="matching.length > shown.length" class="select-hint">
          {{ matching.length }} matches · type to narrow the list
        </div>
      </div>
    </Teleport>
  </div>
</template>
