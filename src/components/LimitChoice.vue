<script setup lang="ts">
import { computed, ref, watch } from "vue";
import SelectMenu from "./SelectMenu.vue";
const props = defineProps<{
  modelValue: number | null;
  label: string;
  ratio?: boolean;
  globalLabel: string;
  mixed?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();
const custom = ref(props.modelValue !== null && props.modelValue >= 0 ? props.modelValue : (props.ratio ? 1 : 60));
watch(() => props.modelValue, value => { if (value !== null && value >= 0) custom.value = value; });
const mode = computed(() => props.modelValue === null ? "keep" : props.modelValue === -2 ? "global" : props.modelValue === -1 ? "unlimited" : "custom");
const options = computed(() => [
  ...(props.mixed ? [{ value: "keep", label: "Keep each transfer’s setting" }] : []),
  { value: "global", label: "Use global limits" },
  { value: "unlimited", label: "Unlimited" },
  { value: "custom", label: props.ratio ? "Custom ratio" : "Custom time" },
]);
function choose(value: string | number) {
  emit("update:modelValue", value === "keep" ? null : value === "global" ? -2 : value === "unlimited" ? -1 : custom.value);
}
</script>
<template>
  <div class="field limit-choice">
    <span>{{ label }}</span>
    <div class="limit-choice-controls">
      <SelectMenu :model-value="mode" :options="options" :label="label" :disabled="disabled" @update:model-value="choose" />
      <input v-if="mode === 'custom'" :value="custom" :aria-label="label + ' value'" type="number" min="0" :step="ratio ? 'any' : '1'" required :disabled="disabled" @input="emit('update:modelValue', ($event.target as HTMLInputElement).valueAsNumber)" />
    </div>
    <small v-if="mode === 'global'">{{ globalLabel }}</small>
    <small v-else-if="mode === 'unlimited'">{{ ratio ? 'No ratio cutoff; this overrides the global ratio limit.' : 'No time cutoff for this transfer.' }}</small>
    <small v-else-if="mode === 'custom' && ratio">Upload {{ modelValue }} times the downloaded amount. A ratio of 1 shares back one full copy.</small>
  </div>
</template>
