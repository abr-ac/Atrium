<script setup lang="ts">
// Top-bar brand mark. Hex + wordmark side-by-side, matching the marketing
// project's AppLogo shape so Atrium reads as part of the same family.

const logoRef = ref<{ startAnimation: () => void } | null>(null);
const pressed = ref(false);

function handleEnter() { logoRef.value?.startAnimation?.(); }
function handlePressOn() { pressed.value = true; }
function handlePressOff() { pressed.value = false; }
</script>

<template>
  <NuxtLink
    to="/"
    class="atrium-brand"
    aria-label="Abracadabra Atrium home"
    @mouseenter="handleEnter"
    @mousedown="handlePressOn"
    @mouseup="handlePressOff"
    @mouseleave="handlePressOff"
    @touchstart.passive="handlePressOn"
    @touchend.passive="handlePressOff"
    @focusin="handleEnter"
  >
    <AbracadabraWordmark
      class="atrium-brand__wordmark"
      text="Atrium"
      :disable-fallback="true"
    />
  </NuxtLink>
</template>

<style scoped>
.atrium-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
}
.atrium-brand__mark {
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}
.atrium-brand:active .atrium-brand__mark {
  transform: scale(0.94);
}
.atrium-brand__wordmark {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ui-text-highlighted);
}
@media (max-width: 767px) {
  .atrium-brand__wordmark {
    display: none;
  }
}
</style>
