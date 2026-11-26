<script setup lang="ts">
import Glyph from "./Glyph.vue";
import { identity, palette, setIdentity } from "../lib/preferences";
import { SWARM_SHAPES } from "../lib/identity";
defineProps<{ hash: string }>();
</script>
<template>
  <div class="identity-editor">
    <span class="field-label">Identity</span>
    <div class="swatches">
      <button
        v-for="color in palette"
        :key="color"
        class="swatch"
        :class="{ chosen: identity(hash).color === color }"
        :style="{ background: color }"
        :aria-label="color"
        @click="setIdentity(hash, color, identity(hash).shape)"
      /><input
        type="color"
        :value="identity(hash).color"
        aria-label="Custom torrent colour"
        @input="
          setIdentity(
            hash,
            ($event.target as HTMLInputElement).value,
            identity(hash).shape,
          )
        "
      />
    </div>
    <div class="shapes">
      <button
        v-for="shape in SWARM_SHAPES"
        :key="shape"
        :class="{ chosen: identity(hash).shape === shape }"
        :aria-label="shape"
        :aria-pressed="identity(hash).shape === shape"
        @click="setIdentity(hash, identity(hash).color, shape)"
      >
        <Glyph :shape="shape" :color="identity(hash).color" />
      </button>
    </div>
  </div>
</template>
