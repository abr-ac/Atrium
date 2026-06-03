<script setup lang="ts">
// Voice room — participant grid + push-to-talk + live transcript stream.
// Audio rides a full-mesh of RTCPeerConnections; signaling is carried on
// awareness (see useAtriumVoice). Per-tile VU rings are driven by an
// AnalyserNode hung off each remote stream.
//
// Local Web Speech API captures speaker transcript chunks and writes them
// into the room's `voice-transcript` Y.Array — every peer sees a live
// closed-caption stream.

import type * as Y from "yjs";

const route = useRoute();
const router = useRouter();
const { doc, publicKeyB64 } = useAbracadabra();
const nav = useAtriumNav();
const voice = useAtriumVoice();
const toast = useToast();

const roomId = computed(() => route.params.id as string);
const self = computed(() => nav.find(roomId.value));
const inhabitants = voice.inhabitantsIn(roomId.value);

const inThisRoom = computed(() => voice.myRoomId.value === roomId.value);

async function toggleScreenShare() {
  try {
    if (voice.screenSharingLocal.value) await voice.stopScreenShare();
    else await voice.startScreenShare();
  }
  catch (e) {
    toast.add({
      title: "Couldn't share screen",
      description: (e as Error).message,
      color: "warning",
      icon: "i-lucide-monitor-x",
    });
  }
}

// Pull screen-share streams from the composable and attach to <video> elems.
const screenStreams = computed(() => {
  const out: Array<{ clientId: number; name: string; color: string; stream: MediaStream }> = [];
  for (const [cid, stream] of voice.remoteScreens.value.entries()) {
    const peer = inhabitants.value.find((p) => p.clientId === cid);
    if (!peer) continue;
    out.push({ clientId: cid, name: peer.name, color: peer.color, stream });
  }
  return out;
});

const screenVideoRefs = ref<Record<number, HTMLVideoElement | null>>({});
function setScreenVideo(cid: number, el: any) {
  screenVideoRefs.value[cid] = el as HTMLVideoElement | null;
}
watch(screenStreams, async (rows) => {
  await nextTick();
  for (const r of rows) {
    const el = screenVideoRefs.value[r.clientId];
    if (el && el.srcObject !== r.stream) {
      el.srcObject = r.stream;
      el.play().catch(() => {});
    }
  }
}, { immediate: true });

// ── Live transcript ────────────────────────────────────────────────────────
// Stored as a Y.Array on the room's child doc, accessed via loadChild.
const transcript = shallowRef<Array<{
  id: string;
  clientId: number;
  name: string;
  color: string;
  text: string;
  ts: number;
  final: boolean;
}>>([]);

let roomDoc: Y.Doc | null = null;
let transcriptArray: any = null;
let transcriptObserver: ((evts: any[]) => void) | null = null;

async function openRoomDoc() {
  const provider = (useAbracadabra().provider as { value: any }).value;
  if (!provider) return;
  try {
    const child = await provider.loadChild(roomId.value);
    roomDoc = child?.document ?? child?.doc ?? null;
    if (!roomDoc) return;
    transcriptArray = roomDoc.getArray("voice-transcript");
    refreshTranscript();
    transcriptObserver = () => refreshTranscript();
    transcriptArray.observe(transcriptObserver);
  }
  catch (e) {
    if (import.meta.dev) console.warn("[voice] failed to open room doc:", e);
  }
}

function refreshTranscript() {
  if (!transcriptArray) return;
  const arr = transcriptArray.toArray() as Array<any>;
  // Keep last 80 entries
  transcript.value = arr.slice(-80);
}

function appendTranscript(text: string, final: boolean) {
  if (!transcriptArray || !text.trim()) return;
  transcriptArray.push([{
    id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    clientId: Math.floor(Math.random() * 1e9),
    name: useAbracadabra().userName.value,
    color: useAbracadabra().userColor.value,
    text: text.trim(),
    ts: Date.now(),
    final,
    publicKey: publicKeyB64.value,
  }]);
}

// ── Speech recognition (Chrome / Safari only) ──────────────────────────────
let recognition: any = null;
const transcriptOn = ref(false);
const lastInterim = ref("");

function startTranscription() {
  if (recognition) return;
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!SR) {
    toast.add({
      title: "Live transcript not supported",
      description: "Use Chrome or Safari to enable Web Speech transcription.",
      color: "warning",
      icon: "i-lucide-circle-alert",
    });
    return;
  }
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language ?? "en-US";

  let lastFinalChunk = "";
  recognition.onresult = (ev: any) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        if (text && text !== lastFinalChunk) {
          appendTranscript(text, true);
          lastFinalChunk = text;
        }
      }
      else {
        interim += text;
      }
    }
    lastInterim.value = interim;
  };
  recognition.onerror = (ev: any) => {
    if (import.meta.dev) console.warn("[voice] recognition error", ev.error);
    // 'aborted' / 'no-speech' are routine; only surface fatal ones.
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
      toast.add({
        title: "Microphone blocked",
        description: "Allow mic access in browser settings to caption your voice.",
        color: "error",
        icon: "i-lucide-mic-off",
      });
    }
  };
  recognition.onend = () => {
    // If still in the room and transcript was on, auto-restart.
    if (transcriptOn.value && inThisRoom.value) {
      try { recognition.start(); }
      catch { /* already started */ }
    }
  };
  try {
    recognition.start();
    transcriptOn.value = true;
  }
  catch (e) {
    if (import.meta.dev) console.warn("[voice] failed to start recognition", e);
  }
}

function stopTranscription() {
  transcriptOn.value = false;
  lastInterim.value = "";
  if (recognition) {
    try { recognition.stop(); }
    catch { /* */ }
    recognition = null;
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  await openRoomDoc();
});

onBeforeUnmount(() => {
  if (transcriptArray && transcriptObserver) {
    try { transcriptArray.unobserve(transcriptObserver); } catch { /* */ }
  }
  // Stop the local SpeechRecognition loop (page-local), but DO NOT call
  // voice.leave() here — the user's WebRTC session is owned by the global
  // useAtriumVoice singletons and must survive route changes. Leaving is
  // an explicit action via the persistent "in voice" widget (see layout).
  stopTranscription();
});

async function join() {
  await voice.join(roomId.value);
}
function leave() {
  voice.leave();
  stopTranscription();
}

// PTT — hold space to unmute, release to mute again.
const pttHeld = ref(false);
function onKeyDown(ev: KeyboardEvent) {
  if (!inThisRoom.value) return;
  const t = ev.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (ev.code === "Space" && !pttHeld.value) {
    pttHeld.value = true;
    voice.setMuted(false);
    ev.preventDefault();
  }
}
function onKeyUp(ev: KeyboardEvent) {
  if (ev.code === "Space" && pttHeld.value) {
    pttHeld.value = false;
    voice.setMuted(true);
  }
}
onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
});

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

useHead(() => ({
  title: `${self.value?.label ?? "Voice"} · Atrium`,
}));
</script>

<template>
  <div class="atrium-voice">
    <header class="atrium-voice__head">
      <div class="flex items-start gap-3">
        <div class="atrium-voice__icon-wrap">
          <UIcon
            :name="`i-lucide-${(self?.meta as any)?.icon ?? 'headphones'}`"
            class="size-7 text-primary"
          />
          <span class="atrium-voice__live-pulse" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="atrium-voice__title">{{ self?.label ?? "Voice" }}</h1>
          <p v-if="(self?.meta as any)?.subtitle" class="atrium-voice__sub">
            {{ (self?.meta as any).subtitle }}
          </p>
        </div>
        <UBadge
          color="primary"
          variant="subtle"
          size="sm"
          icon="i-lucide-radio"
        >
          {{ inhabitants.length }} {{ inhabitants.length === 1 ? "voice" : "voices" }}
        </UBadge>
      </div>
    </header>

    <section
      v-if="screenStreams.length > 0"
      class="atrium-voice__screens"
    >
      <article
        v-for="r in screenStreams"
        :key="`screen-${r.clientId}`"
        class="atrium-voice__screen"
      >
        <header class="atrium-voice__screen-head">
          <span class="atrium-voice__screen-dot" :style="{ background: r.color }" />
          <span class="atrium-voice__screen-name">{{ r.name }} is sharing</span>
          <UBadge color="error" variant="soft" size="sm" class="ml-auto">
            <UIcon name="i-lucide-radio" class="size-3" />
            LIVE
          </UBadge>
        </header>
        <video
          :ref="(el) => setScreenVideo(r.clientId, el)"
          class="atrium-voice__screen-video"
          autoplay
          playsinline
          muted
        />
      </article>
    </section>

    <section class="atrium-voice__grid">
      <AtriumVoiceTile
        v-for="p in inhabitants"
        :key="p.clientId"
        :peer="p"
      />
      <article
        v-if="inhabitants.length === 0"
        class="atrium-voice__empty"
      >
        <UIcon name="i-lucide-headphones" class="size-7 text-dimmed" />
        <p class="text-sm text-dimmed">No one's in yet. Be the first.</p>
      </article>
    </section>

    <aside class="atrium-voice__transcript">
      <header class="atrium-voice__transcript-head">
        <UIcon name="i-lucide-captions" class="size-4 text-primary" />
        <span class="text-xs font-semibold uppercase tracking-wider text-dimmed">
          Live captions
        </span>
        <UButton
          v-if="!transcriptOn"
          :disabled="!inThisRoom"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-mic-vocal"
          class="ml-auto"
          @click="startTranscription"
        >
          Caption me
        </UButton>
        <UButton
          v-else
          color="primary"
          variant="soft"
          size="xs"
          icon="i-lucide-square"
          class="ml-auto"
          @click="stopTranscription"
        >
          Stop captions
        </UButton>
      </header>
      <ol class="atrium-voice__transcript-list">
        <li v-for="t in transcript" :key="t.id">
          <span
            class="atrium-voice__transcript-name"
            :style="{ color: t.color }"
          >{{ t.name }}</span>
          <span class="atrium-voice__transcript-text">{{ t.text }}</span>
          <span class="atrium-voice__transcript-ts">
            {{ relativeTime(t.ts) }}
          </span>
        </li>
        <li v-if="lastInterim" class="atrium-voice__transcript-interim">
          <span class="atrium-voice__transcript-name">…you</span>
          <span class="atrium-voice__transcript-text italic">{{ lastInterim }}</span>
        </li>
        <li
          v-if="transcript.length === 0 && !lastInterim"
          class="atrium-voice__transcript-empty"
        >
          Click "Caption me" while in the room to start.
        </li>
      </ol>
    </aside>

    <footer class="atrium-voice__bar">
      <template v-if="inThisRoom">
        <UButton
          :color="voice.myMuted.value ? 'neutral' : 'primary'"
          :variant="voice.myMuted.value ? 'soft' : 'solid'"
          size="lg"
          :icon="voice.myMuted.value ? 'i-lucide-mic-off' : 'i-lucide-mic'"
          @click="voice.toggleMute"
        >
          <template v-if="voice.myMuted.value">Unmute</template>
          <template v-else>Mute</template>
        </UButton>
        <UButton
          :color="voice.screenSharingLocal.value ? 'error' : 'neutral'"
          :variant="voice.screenSharingLocal.value ? 'soft' : 'ghost'"
          size="lg"
          :icon="voice.screenSharingLocal.value ? 'i-lucide-monitor-x' : 'i-lucide-monitor'"
          @click="toggleScreenShare"
        >
          <template v-if="voice.screenSharingLocal.value">Stop sharing</template>
          <template v-else>Share screen</template>
        </UButton>
        <span class="atrium-voice__bar-hint">
          Hold <UKbd>Space</UKbd> for push-to-talk
        </span>
        <UButton
          color="error"
          variant="soft"
          size="lg"
          icon="i-lucide-phone-off"
          class="ml-auto"
          @click="leave"
        >
          Leave
        </UButton>
      </template>
      <template v-else>
        <p class="atrium-voice__bar-pitch">
          Drop in to share the channel — your mic stays muted until you say so.
        </p>
        <UButton
          color="primary"
          size="lg"
          icon="i-lucide-radio"
          class="ml-auto"
          @click="join"
        >
          Join the room
        </UButton>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.atrium-voice {
  max-width: 64rem;
  margin: 0 auto;
  width: 100%;
  padding: 1.4rem 1.5rem 1.4rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "head head"
    "grid transcript"
    "bar bar";
  gap: 1rem;
  height: 100%;
  min-height: 0;
}
@media (max-width: 900px) {
  .atrium-voice {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "head"
      "grid"
      "transcript"
      "bar";
  }
}
.atrium-voice__head { grid-area: head; }
.atrium-voice__grid { grid-area: grid; }
.atrium-voice__screens {
  grid-area: grid;
  display: grid;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
}
.atrium-voice__screen {
  border: 1px solid color-mix(in srgb, var(--ui-primary) 30%, var(--ui-border));
  border-radius: var(--atrium-radius-md, 0.65rem);
  overflow: hidden;
  background: #000;
  display: flex;
  flex-direction: column;
}
.atrium-voice__screen-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.7rem;
  background: var(--ui-bg-elevated);
  border-bottom: 1px solid var(--ui-border);
  font-size: 0.825rem;
}
.atrium-voice__screen-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 9999px;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-primary) 22%, transparent);
}
.atrium-voice__screen-name {
  font-weight: 500;
}
.atrium-voice__screen-video {
  width: 100%;
  display: block;
  aspect-ratio: 16 / 9;
  background: #000;
  object-fit: contain;
}
.atrium-voice__transcript { grid-area: transcript; }
.atrium-voice__bar { grid-area: bar; }

.atrium-voice__icon-wrap {
  position: relative;
  margin-top: 0.1rem;
}
.atrium-voice__live-pulse {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--ui-color-success-500, #10b981);
  box-shadow: 0 0 0 2px var(--ui-bg);
  animation: atrium-voice-pulse 1.6s ease-in-out infinite;
}
@keyframes atrium-voice-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.2); }
}
.atrium-voice__title {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}
.atrium-voice__sub {
  font-size: 0.8125rem;
  color: var(--ui-text-dimmed);
  margin: 0.25rem 0 0;
}

.atrium-voice__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 0.8rem;
  align-content: start;
}
.atrium-voice__empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  border: 1px dashed var(--ui-border);
  border-radius: 0.7rem;
}

.atrium-voice__transcript {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ui-border);
  border-radius: 0.7rem;
  background: var(--ui-bg);
  overflow: hidden;
  min-height: 0;
}
.atrium-voice__transcript-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--ui-border);
}
.atrium-voice__transcript-list {
  list-style: none;
  margin: 0;
  padding: 0.55rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  overflow-y: auto;
  flex: 1;
  font-size: 0.78rem;
  line-height: 1.45;
}
.atrium-voice__transcript-list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.45rem;
  align-items: baseline;
}
.atrium-voice__transcript-name {
  font-weight: 600;
}
.atrium-voice__transcript-text {
  color: var(--ui-text);
  word-break: break-word;
}
.atrium-voice__transcript-ts {
  color: var(--ui-text-dimmed);
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.atrium-voice__transcript-interim .atrium-voice__transcript-text {
  color: var(--ui-text-dimmed);
}
.atrium-voice__transcript-empty {
  display: block;
  color: var(--ui-text-dimmed);
  text-align: center;
  font-size: 0.75rem;
  padding: 0.5rem;
}

.atrium-voice__bar {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.7rem;
  background: var(--ui-bg);
}
.atrium-voice__bar-hint,
.atrium-voice__bar-pitch {
  font-size: 0.8125rem;
  color: var(--ui-text-dimmed);
}
</style>
