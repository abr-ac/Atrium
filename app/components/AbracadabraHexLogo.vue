<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  computed,
} from "vue";

const props = withDefaults(
  defineProps<{
    active?: boolean;
    static?: boolean;
    subtle?: boolean;
    pressed?: boolean;
  }>(),
  {
    active: undefined,
    static: false,
    subtle: false,
    pressed: false,
  },
);

const hasAnimated = ref(false);
const hasFilled = ref(false);
let fillTimer: ReturnType<typeof setTimeout> | null = null;

function startAnimation() {
  hasAnimated.value = false;
  hasFilled.value = false;
  if (fillTimer) clearTimeout(fillTimer);
  nextTick(() => {
    hasAnimated.value = true;
    fillTimer = setTimeout(() => {
      hasFilled.value = true;
    }, 2400);
  });
}

if (props.static) {
  hasAnimated.value = true;
  hasFilled.value = true;
} else if (props.active !== undefined) {
  watch(
    () => props.active,
    (val) => {
      if (val) startAnimation();
    },
    { immediate: true },
  );
} else {
  onMounted(() => startAnimation());
}

onBeforeUnmount(() => {
  if (fillTimer) clearTimeout(fillTimer);
});

const effectiveFilled = computed(() => hasFilled.value || props.pressed);
const effectiveSubtle = computed(() => props.subtle && !props.pressed);
const effectiveAnimated = computed(() => hasAnimated.value || props.pressed);

defineExpose({ startAnimation });
</script>

<template>
  <svg
    viewBox="0 0 100 90"
    overflow="visible"
    class="w-24 h-24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :class="{
      'logo--filled': effectiveFilled,
      'logo--subtle': effectiveSubtle,
    }"
  >
    <!-- Outer Hexagon -->
    <path
      d="M50 15 L75 30 V60 L50 75 L25 60 V30 Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
      :class="['lattice-hex', { 'lattice-hex--visible': effectiveAnimated }]"
    />

    <!-- Internal Lattice (Ribs) - Cleaned to avoid redundant bottom line -->
    <path
      d="M50 15 V45 M50 45 L75 60 M50 45 L25 60"
      stroke="currentColor"
      stroke-width="1"
      stroke-linejoin="round"
      stroke-linecap="round"
      :class="[
        'lattice-inner',
        { 'lattice-inner--visible': effectiveAnimated },
      ]"
    />

    <!-- Outer Triangle (Mark A) -->
    <path
      d="M50 15 L25 60 H75 Z"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linejoin="round"
      stroke-linecap="round"
      :class="['mark-a', { 'mark-a--visible': effectiveAnimated }]"
    />

    <!-- Inner Triangle (Mark Small) -->
    <path
      d="M50 45 L25 60 H75 Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
      :class="['mark-small', { 'mark-small--visible': effectiveAnimated }]"
    />
  </svg>
</template>

<style scoped>
.lattice-hex {
  opacity: 0;
  fill: transparent;
  stroke-dasharray: 300;
  stroke-dashoffset: 300;
  transition:
    stroke-dashoffset 1.6s cubic-bezier(0.4, 0, 0.2, 1),
    fill 0.5s ease,
    opacity 0.4s ease;
}
.lattice-hex--visible {
  opacity: 0.45;
  stroke-dashoffset: 0;
}

.lattice-inner {
  opacity: 0;
  stroke-dasharray: 400;
  stroke-dashoffset: 400;
  transition:
    stroke-dashoffset 1.8s cubic-bezier(0.4, 0, 0.2, 1) 0.3s,
    opacity 0.4s ease 0.3s;
}
.lattice-inner--visible {
  opacity: 0.25;
  stroke-dashoffset: 0;
}

.mark-a {
  opacity: 0;
  fill: transparent;
  stroke-dasharray: 200;
  stroke-dashoffset: 200;
  transition:
    stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1) 0.5s,
    fill 0.5s ease,
    stroke 0.3s ease,
    opacity 0.3s ease 0.5s;
}
.mark-a--visible {
  opacity: 0.9;
  stroke-dashoffset: 0;
}

.mark-small {
  opacity: 0;
  fill: transparent;
  stroke-dasharray: 120;
  stroke-dashoffset: 120;
  transition:
    stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1) 0.8s,
    fill 0.5s ease,
    stroke 0.3s ease,
    opacity 0.3s ease 0.8s;
}
.mark-small--visible {
  opacity: 0.6;
  stroke-dashoffset: 0;
}

.logo--filled .lattice-hex {
  fill: currentColor;
  opacity: 1;
}
.logo--filled .mark-a {
  fill: var(--ui-bg, #fff);
  stroke: var(--ui-bg, #fff);
  stroke-width: 1;
  opacity: 1;
}
.logo--filled .mark-small {
  fill: currentColor;
  stroke: transparent;
  opacity: 0.21;
}
.logo--filled .lattice-inner {
  opacity: 0.4;
}

/* Subtle variant */
.logo--subtle .lattice-hex--visible {
  opacity: 0.55;
  fill: transparent;
}
.logo--subtle .lattice-inner--visible {
  opacity: 0.3;
}
.logo--subtle .mark-a--visible {
  opacity: 0.75;
  fill: transparent;
}
.logo--subtle .mark-small--visible {
  opacity: 0.4;
  fill: transparent;
}
.logo--subtle.logo--filled .lattice-hex {
  fill: transparent;
  opacity: 0.55;
}
.logo--subtle.logo--filled .mark-a {
  fill: transparent;
  stroke: currentColor;
  opacity: 0.8;
}
.logo--subtle.logo--filled .mark-small {
  fill: transparent;
  stroke: currentColor;
  opacity: 0.45;
}
.logo--subtle.logo--filled .lattice-inner {
  opacity: 0.25;
}
</style>
