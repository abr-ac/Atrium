<script setup lang="ts">
import type { AwarenessEntry, LogoSelection } from '~/composables/useHybridAwareness'

const props = withDefaults(defineProps<{ text?: string, disableFallback?: boolean }>(), {
  text: 'Abracadabra',
  disableFallback: false
})

const { states, currentUser, setLocalState, clientId } = useHybridAwareness({
  disableFallback: props.disableFallback
})

const chars = computed(() => props.text.split(''))
const isDragging = ref(false)

function onCharMousedown(i: number) {
  isDragging.value = true
  setLocalState({ logoSelection: { anchor: i, head: i } })
  const onMouseUp = () => {
    isDragging.value = false
    window.removeEventListener('mouseup', onMouseUp)
  }
  window.addEventListener('mouseup', onMouseUp)
}

function onCharEnter(i: number) {
  if (isDragging.value) {
    const current = currentUser.value?.logoSelection || { anchor: i, head: i }
    setLocalState({ logoSelection: { anchor: current.anchor, head: i } })
  } else {
    setLocalState({ logoSelection: { anchor: i, head: i } })
  }
}

function onCharLeave() {
  if (!isDragging.value) {
    setLocalState({ logoSelection: null })
  }
}

function onTouchStart(i: number) {
  isDragging.value = true
  setLocalState({ logoSelection: { anchor: i, head: i } })
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value || !e.touches[0]) return
  const touch = e.touches[0]
  const el = document.elementFromPoint(touch.clientX, touch.clientY)
  const charSpan = el?.closest('.logo-char') as HTMLElement | null
  if (charSpan && charSpan.dataset.index !== undefined) {
    const i = Number.parseInt(charSpan.dataset.index, 10)
    const current: LogoSelection = currentUser.value?.logoSelection || { anchor: i, head: i }
    setLocalState({ logoSelection: { anchor: current.anchor, head: i } })
  }
}

function onTouchEnd() {
  isDragging.value = false
  setLocalState({ logoSelection: null })
}

const remoteCursors = computed(() =>
  states.value
    .filter((s: AwarenessEntry) => s.logoSelection != null && s.clientId !== clientId.value)
    .map((s: AwarenessEntry) => ({
      clientId: s.clientId,
      name: s.user?.name ?? 'Anonymous',
      color: s.user?.color ?? 'var(--ui-color-primary-500)',
      anchor: s.logoSelection?.anchor ?? 0,
      head: s.logoSelection?.head ?? 0
    }))
)

const localCursor = computed(() => currentUser.value?.logoSelection ?? null)

function getCharStyle(i: number) {
  const activeCursors = remoteCursors.value.filter((c) => {
    const start = Math.min(c.anchor, c.head)
    const end = Math.max(c.anchor, c.head)
    return i >= start && i <= end
  })
  const local = localCursor.value
  const localStart = local ? Math.min(local.anchor, local.head) : -1
  const localEnd = local ? Math.max(local.anchor, local.head) : -1
  const isLocalSelected = local && i >= localStart && i <= localEnd
  const style: Record<string, string> = { position: 'relative' }
  if (isLocalSelected) {
    style.backgroundColor = 'color-mix(in srgb, var(--ui-color-primary-500) 40%, transparent)'
    style.color = 'var(--ui-color-primary-500)'
    if (i === localStart) {
      style.borderTopLeftRadius = '2px'
      style.borderBottomLeftRadius = '2px'
    }
    if (i === localEnd) {
      style.borderTopRightRadius = '2px'
      style.borderBottomRightRadius = '2px'
    }
  } else if (activeCursors[0]) {
    const first = activeCursors[0]
    const selStart = Math.min(first.anchor, first.head)
    const selEnd = Math.max(first.anchor, first.head)
    style.backgroundColor = `color-mix(in srgb, ${first.color} 40%, transparent)`
    style.color = first.color
    if (i === selStart) {
      style.borderTopLeftRadius = '2px'
      style.borderBottomLeftRadius = '2px'
    }
    if (i === selEnd) {
      style.borderTopRightRadius = '2px'
      style.borderBottomRightRadius = '2px'
    }
  }
  return style
}
</script>

<template>
  <div class="abra-logo" @mouseleave="onCharLeave()">
    <span
      v-for="(char, i) in chars"
      :key="i"
      class="logo-char"
      :data-index="i"
      :style="getCharStyle(i)"
      @mousedown="onCharMousedown(i)"
      @mouseenter="onCharEnter(i)"
      @touchstart.passive="onTouchStart(i)"
      @touchmove.prevent="onTouchMove"
      @touchend="onTouchEnd"
    >
      {{ char }}
      <ClientOnly>
        <template v-for="c in remoteCursors" :key="c.clientId">
          <div
            v-if="c.head === i"
            class="remote-cursor"
            :class="c.head < c.anchor ? 'cursor-left' : 'cursor-right'"
            :style="{ '--cursor-color': c.color }"
          >
            <div class="cursor-label" :style="{ background: c.color }">
              {{ c.name }}
            </div>
          </div>
        </template>
        <div
          v-if="localCursor?.head === i"
          class="local-cursor"
          :class="localCursor.head < localCursor.anchor ? 'cursor-left' : 'cursor-right'"
        />
      </ClientOnly>
    </span>
  </div>
</template>

<style scoped>
.abra-logo {
  display: inline-block;
  overflow: visible;
  white-space: nowrap;
  max-width: 100%;
  letter-spacing: -0.03em;
  cursor: text;
  user-select: none;
  color: var(--ui-text-highlighted);
  touch-action: none;
  padding: 0 0.25rem;
}

.logo-char {
  display: inline-block;
  padding: 0 1px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.remote-cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: var(--cursor-color);
  z-index: 10;
}

.cursor-left {
  left: -1px;
}

.cursor-right {
  right: -1px;
}

.cursor-label {
  position: absolute;
  top: -18px;
  left: -2px;
  padding: 1px 4px;
  border-radius: 3px;
  color: white;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  line-height: 1.2;
  letter-spacing: 0;
}

.local-cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: var(--ui-color-primary-500);
  z-index: 10;
}
</style>
