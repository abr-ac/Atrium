/**
 * Hybrid awareness: real @abraca/nuxt awareness when connected,
 * scripted Alice/Bob fallback when the hub is unreachable.
 *
 * AbracadabraWordmark consumes the same shape either way:
 *   { states, currentUser, setLocalState }
 * where states is an array of `{ clientId, user?, logoSelection? }` entries.
 */
export interface LogoSelection { anchor: number, head: number }
export interface AwarenessUser { name: string, color: string }
export interface AwarenessEntry {
  clientId: number
  user?: AwarenessUser
  logoSelection?: LogoSelection | null
}

const TEXT_LENGTH = 'Abracadabra'.length

const MOCK_ALICE = { clientId: 9001, user: { name: 'Alice', color: '#a855f7' } }
const MOCK_BOB = { clientId: 9002, user: { name: 'Bob', color: '#3b82f6' } }

function scriptedRange(timeMs: number, offset: number, span: number): LogoSelection {
  const cycle = 7000
  const t = ((timeMs + offset) % cycle) / cycle
  const anchor = Math.floor(t * (TEXT_LENGTH - span))
  return { anchor, head: Math.min(TEXT_LENGTH - 1, anchor + span) }
}

export function useHybridAwareness(opts: { disableFallback?: boolean } = {}) {
  const nuxtApp = useNuxtApp() as unknown as { $abracadabra?: { provider?: Ref<unknown> } }
  const provider = nuxtApp.$abracadabra?.provider as Ref<any> | undefined

  const realStates = ref<AwarenessEntry[]>([])
  const localSelection = ref<LogoSelection | null>(null)
  const isLive = ref(false)

  let changeUnsub: (() => void) | null = null
  let mockTimer: ReturnType<typeof setInterval> | null = null
  let providerWatchStop: (() => void) | null = null
  let mockStartTimer: ReturnType<typeof setTimeout> | null = null
  let startTime = 0

  function clearMock() {
    if (mockTimer) {
      clearInterval(mockTimer)
      mockTimer = null
    }
  }

  function tickMock() {
    const now = Date.now() - startTime
    realStates.value = [
      { ...MOCK_ALICE, logoSelection: scriptedRange(now, 0, 3) },
      { ...MOCK_BOB, logoSelection: scriptedRange(now, 3500, 4) }
    ]
  }

  function startMock() {
    if (mockTimer) return
    startTime = Date.now()
    tickMock()
    mockTimer = setInterval(tickMock, 120)
  }

  function flushReal() {
    if (!provider?.value?.awareness) return
    const awareness = provider.value.awareness
    const entries: AwarenessEntry[] = []
    awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
      entries.push({ clientId, ...(state as Omit<AwarenessEntry, 'clientId'>) })
    })
    realStates.value = entries
    isLive.value = true
  }

  function subscribeReal() {
    if (!provider?.value?.awareness) return
    const awareness = provider.value.awareness
    const handler = () => flushReal()
    awareness.on('change', handler)
    changeUnsub = () => awareness.off('change', handler)
    flushReal()
  }

  function unsubscribeReal() {
    changeUnsub?.()
    changeUnsub = null
  }

  onMounted(() => {
    if (!import.meta.client) return

    if (!opts.disableFallback) {
      mockStartTimer = setTimeout(() => {
        if (!isLive.value) startMock()
      }, 2500)
    }

    if (provider) {
      providerWatchStop = watch(provider, (p, oldP) => {
        if (oldP?.awareness) unsubscribeReal()
        if (p?.awareness) {
          clearMock()
          subscribeReal()
        }
      }, { immediate: true })
    } else if (!opts.disableFallback) {
      startMock()
    }
  })

  onBeforeUnmount(() => {
    if (mockStartTimer) clearTimeout(mockStartTimer)
    clearMock()
    unsubscribeReal()
    providerWatchStop?.()
  })

  const clientId = computed<number>(() => provider?.value?.awareness?.clientID ?? -1)

  const states = computed<AwarenessEntry[]>(() => {
    const entries = realStates.value.slice()
    if (isLive.value && localSelection.value) {
      entries.push({
        clientId: clientId.value,
        logoSelection: localSelection.value
      })
    }
    return entries
  })

  const currentUser = computed<AwarenessEntry | null>(() => {
    if (!localSelection.value) return null
    return {
      clientId: clientId.value,
      logoSelection: localSelection.value
    }
  })

  function setLocalState(next: { logoSelection?: LogoSelection | null }) {
    localSelection.value = next.logoSelection ?? null
    if (provider?.value?.awareness) {
      const awareness = provider.value.awareness
      const current = awareness.getLocalState() || {}
      awareness.setLocalState({ ...current, logoSelection: next.logoSelection ?? null })
    }
  }

  return {
    states,
    currentUser,
    setLocalState,
    isLive,
    clientId
  }
}
