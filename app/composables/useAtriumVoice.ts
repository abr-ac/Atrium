// useAtriumVoice — voice-room presence, mic plumbing, and WebRTC audio mesh.
//
// Awareness layer (`atrium-voice`) carries:
//   { roomId, muted, speaking, joinedAt }
// for every participant. `inhabitantsIn(roomId)` derives the participant list
// from peer awareness; `join` / `leave` toggle local membership and pull up
// the mic capture + speaking-detection loop.
//
// Mesh layer (`atrium-voice-signals`) carries SDP + ICE addressed by peer
// clientId. Pairing rule: the smaller clientId initiates the offer; the
// larger answers. ICE candidates are appended to a per-pair list with a ts
// so receivers can replay-skip ones they've already added.
//
// Module-level singletons hold the AudioContext, the mic MediaStream, the
// RTCPeerConnection map, and the remote <audio> elements — all of these
// must survive composable re-instantiation across components on the same
// page.

export interface VoicePresence {
  clientId: number;
  name: string;
  color: string;
  publicKey?: string;
  speaking: boolean;
  muted: boolean;
  idle: boolean;
}

const FIELD = "atrium-voice";
const SIGNAL_FIELD = "atrium-voice-signals";
const ICE_BUFFER = 24;

interface LocalVoiceState {
  roomId: string;
  muted: boolean;
  speaking: boolean;
  joinedAt: number;
  screenShare?: boolean;
}

interface IceItem {
  ts: number;
  cand: RTCIceCandidateInit;
}

interface SignalBox {
  offer?: { sdp: string; type: "offer"; ts: number };
  answer?: { sdp: string; type: "answer"; ts: number };
  iceList?: IceItem[];
}

type SignalMap = Record<string, SignalBox>; // key = recipient clientId

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaStream: MediaStream | null = null;
let speakingTimer: ReturnType<typeof setInterval> | null = null;

// ── Screen share state ─────────────────────────────────────────────────────
// Single shared screen stream (one share per local user at a time). Track
// senders per peer connection so stopShare() can cleanly remove them.
let screenStream: MediaStream | null = null;
const screenSenders = new Map<number, RTCRtpSender>();
const remoteScreens = ref<Map<number, MediaStream>>(new Map());
const screenSharingLocal = ref(false);

const peerConnections = new Map<number, RTCPeerConnection>();
const remoteAudio = new Map<number, HTMLAudioElement>();
const peerAnalysers = new Map<number, AnalyserNode>();
const seenIceTs = new Map<number, number>(); // last ICE ts processed per peer
const seenOfferTs = new Map<number, number>(); // last remote-offer ts accepted
const seenAnswerTs = new Map<number, number>(); // last remote-answer ts accepted

// Reactive 0..1 audio levels keyed by clientId (own clientId for self).
const audioLevels = ref<Map<number, number>>(new Map());
let levelTimer: ReturnType<typeof setInterval> | null = null;
let myClientIdForLevels: number | null = null;
let awarenessHandler: ((args: { added: number[]; updated: number[]; removed: number[] }) => void) | null = null;
let awarenessRef: any = null;

function buildRtcConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  // Pull TURN credentials from the public runtime config when present so
  // NAT'd peers get a relay fallback. useRuntimeConfig() works at module
  // scope on the client because Nuxt's runtime injects it on app boot.
  try {
    const cfg = useRuntimeConfig?.()?.public?.atrium?.turn as
      | { url?: string; username?: string; credential?: string }
      | undefined;
    if (cfg?.url) {
      servers.push({
        urls: cfg.url,
        username: cfg.username,
        credential: cfg.credential,
      });
    }
  }
  catch {
    // Runtime config not available (SSR boot); silently fall back to STUN only.
  }
  return { iceServers: servers };
}

let _rtcConfig: RTCConfiguration | null = null;
function getRtcConfig(): RTCConfiguration {
  if (!_rtcConfig) _rtcConfig = buildRtcConfig();
  return _rtcConfig;
}

export function useAtriumVoice() {
  const abra = useAbracadabra();
  const { peers, currentUser } = useAwarenessPeers();

  function getAwareness(): any {
    return (abra.provider.value as any)?.awareness ?? null;
  }

  function writeLocal(state: LocalVoiceState | null) {
    const aw = getAwareness();
    if (!aw) return;
    aw.setLocalStateField(FIELD, state);
  }

  function readLocalState(): LocalVoiceState | null {
    const aw = getAwareness();
    if (!aw) return null;
    return aw.getLocalState()?.[FIELD] ?? null;
  }

  function readLocalSignals(): SignalMap {
    const aw = getAwareness();
    if (!aw) return {};
    return (aw.getLocalState()?.[SIGNAL_FIELD] ?? {}) as SignalMap;
  }

  function writeLocalSignals(map: SignalMap) {
    const aw = getAwareness();
    if (!aw) return;
    aw.setLocalStateField(SIGNAL_FIELD, map);
  }

  function updateSignalFor(peerId: number, patch: (box: SignalBox) => SignalBox) {
    const map = { ...readLocalSignals() };
    const next = patch({ ...(map[String(peerId)] ?? {}) });
    map[String(peerId)] = next;
    writeLocalSignals(map);
  }

  function clearSignalsFor(peerId: number) {
    const map = { ...readLocalSignals() };
    delete map[String(peerId)];
    writeLocalSignals(map);
  }

  function clearAllSignals() {
    writeLocalSignals({});
  }

  const myRoomId = ref<string | null>(null);
  const myMuted = ref(true);
  const mySpeaking = ref(false);

  function inhabitantsIn(roomId: string) {
    return computed<VoicePresence[]>(() => {
      const out: VoicePresence[] = [];
      const localState = readLocalState();
      if (localState?.roomId === roomId && currentUser.value) {
        out.push({
          clientId: currentUser.value.clientId,
          name: currentUser.value.user?.name ?? "you",
          color: currentUser.value.user?.color ?? "#888",
          publicKey: currentUser.value.user?.publicKey,
          speaking: mySpeaking.value,
          muted: myMuted.value,
          idle: false,
        });
      }
      for (const p of peers.value) {
        const v = (p as any)[FIELD] as LocalVoiceState | undefined;
        if (!v || v.roomId !== roomId) continue;
        out.push({
          clientId: p.clientId,
          name: p.user?.name ?? "someone",
          color: p.user?.color ?? "#888",
          publicKey: p.user?.publicKey,
          speaking: !!v.speaking,
          muted: !!v.muted,
          idle: !!p.idle,
        });
      }
      return out;
    });
  }

  function countIn(roomId: string) {
    return computed(() => inhabitantsIn(roomId).value.length);
  }

  // ── Mic capture / speaking detection ────────────────────────────────────

  async function startMicCapture() {
    if (mediaStream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone not supported");
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = audioCtx ?? new AudioContext();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    // Mic track starts disabled — unmute() flips track.enabled when ready.
    for (const t of mediaStream.getAudioTracks()) t.enabled = false;

    const buffer = new Float32Array(analyser.frequencyBinCount);
    let lastBroadcast = 0;
    speakingTimer = setInterval(() => {
      if (!analyser) return;
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i]! * buffer[i]!;
      const rms = Math.sqrt(sum / buffer.length);
      const speakingNow = !myMuted.value && rms > 0.012;
      if (speakingNow !== mySpeaking.value || Date.now() - lastBroadcast > 1500) {
        mySpeaking.value = speakingNow;
        lastBroadcast = Date.now();
        const cur = readLocalState();
        if (cur) writeLocal({ ...cur, speaking: speakingNow });
      }
    }, 120);
  }

  function stopMicCapture() {
    if (speakingTimer) {
      clearInterval(speakingTimer);
      speakingTimer = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    analyser = null;
    mySpeaking.value = false;
  }

  // ── WebRTC mesh ─────────────────────────────────────────────────────────

  function myClientId(): number | null {
    return currentUser.value?.clientId ?? null;
  }

  function ensureAudioElement(peerId: number): HTMLAudioElement {
    let el = remoteAudio.get(peerId);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.dataset.atriumVoicePeer = String(peerId);
      el.style.display = "none";
      document.body.appendChild(el);
      remoteAudio.set(peerId, el);
    }
    return el;
  }

  function disposePeer(peerId: number) {
    const pc = peerConnections.get(peerId);
    if (pc) {
      try { pc.close(); }
      catch {}
      peerConnections.delete(peerId);
    }
    const el = remoteAudio.get(peerId);
    if (el) {
      el.srcObject = null;
      el.remove();
      remoteAudio.delete(peerId);
    }
    peerAnalysers.delete(peerId);
    if (audioLevels.value.has(peerId)) {
      const next = new Map(audioLevels.value);
      next.delete(peerId);
      audioLevels.value = next;
    }
    seenIceTs.delete(peerId);
    seenOfferTs.delete(peerId);
    seenAnswerTs.delete(peerId);
    clearSignalsFor(peerId);
  }

  function attachPeerAnalyser(peerId: number, stream: MediaStream) {
    if (peerAnalysers.has(peerId)) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    try {
      const src = audioCtx.createMediaStreamSource(stream);
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.7;
      src.connect(an);
      peerAnalysers.set(peerId, an);
    }
    catch (e) {
      if (import.meta.dev) console.warn("[voice mesh] attach analyser failed", e);
    }
  }

  function startLevelLoop() {
    if (levelTimer) return;
    const bufs = new Map<number, Float32Array>();
    const ensureBuf = (key: number, size: number): Float32Array => {
      let b = bufs.get(key);
      if (!b || b.length !== size) {
        b = new Float32Array(size);
        bufs.set(key, b);
      }
      return b;
    };
    const rmsOf = (an: AnalyserNode, key: number): number => {
      const buf = ensureBuf(key, an.frequencyBinCount);
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
      return Math.sqrt(sum / buf.length);
    };
    levelTimer = setInterval(() => {
      const next = new Map<number, number>();
      for (const [cid, an] of peerAnalysers.entries()) {
        // RMS 0.2 corresponds to a loud voice; clamp display to 0..1.
        next.set(cid, Math.min(1, rmsOf(an, cid) / 0.2));
      }
      if (analyser) {
        const me = myClientIdForLevels ?? currentUser.value?.clientId ?? -1;
        myClientIdForLevels = me;
        const local = myMuted.value ? 0 : Math.min(1, rmsOf(analyser, me) / 0.2);
        next.set(me, local);
      }
      audioLevels.value = next;
    }, 80);
  }

  function stopLevelLoop() {
    if (levelTimer) {
      clearInterval(levelTimer);
      levelTimer = null;
    }
    audioLevels.value = new Map();
    myClientIdForLevels = null;
  }

  function levelOf(clientId: number) {
    return computed(() => audioLevels.value.get(clientId) ?? 0);
  }

  function createPeerConnection(peerId: number): RTCPeerConnection {
    const existing = peerConnections.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(getRtcConfig());
    peerConnections.set(peerId, pc);

    // Push local tracks
    if (mediaStream) {
      for (const track of mediaStream.getAudioTracks()) {
        pc.addTrack(track, mediaStream);
      }
    }

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (!stream) return;
      // Video tracks are screen shares; audio tracks are voice.
      if (ev.track.kind === "video") {
        const next = new Map(remoteScreens.value);
        next.set(peerId, stream);
        remoteScreens.value = next;
        ev.track.addEventListener("ended", () => {
          const m = new Map(remoteScreens.value);
          m.delete(peerId);
          remoteScreens.value = m;
        });
        return;
      }
      const el = ensureAudioElement(peerId);
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        el.play().catch(() => {});
      }
      attachPeerAnalyser(peerId, stream);
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      updateSignalFor(peerId, (box) => {
        const list = box.iceList ?? [];
        const next: IceItem = { ts: Date.now(), cand: ev.candidate!.toJSON() };
        const trimmed = [...list, next].slice(-ICE_BUFFER);
        return { ...box, iceList: trimmed };
      });
    };

    pc.onconnectionstatechange = () => {
      if (import.meta.dev) {
        console.debug(`[voice mesh] pc ${peerId} → ${pc.connectionState}`);
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        // Caller will rebuild on next awareness tick if peer still in room.
      }
    };

    return pc;
  }

  async function makeOfferTo(peerId: number) {
    const pc = createPeerConnection(peerId);
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    updateSignalFor(peerId, (box) => ({
      ...box,
      offer: { sdp: offer.sdp ?? "", type: "offer", ts: Date.now() },
    }));
  }

  async function acceptOfferFrom(peerId: number, sdp: string, ts: number) {
    if ((seenOfferTs.get(peerId) ?? 0) >= ts) return;
    const pc = createPeerConnection(peerId);
    if (pc.signalingState !== "stable" && pc.signalingState !== "have-local-offer") return;
    try {
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      seenOfferTs.set(peerId, ts);
      updateSignalFor(peerId, (box) => ({
        ...box,
        answer: { sdp: answer.sdp ?? "", type: "answer", ts: Date.now() },
      }));
    }
    catch (e) {
      if (import.meta.dev) console.warn("[voice mesh] acceptOffer", e);
    }
  }

  async function acceptAnswerFrom(peerId: number, sdp: string, ts: number) {
    if ((seenAnswerTs.get(peerId) ?? 0) >= ts) return;
    const pc = peerConnections.get(peerId);
    if (!pc) return;
    if (pc.signalingState !== "have-local-offer") return;
    try {
      await pc.setRemoteDescription({ type: "answer", sdp });
      seenAnswerTs.set(peerId, ts);
    }
    catch (e) {
      if (import.meta.dev) console.warn("[voice mesh] acceptAnswer", e);
    }
  }

  async function drainIceFor(peerId: number, list: IceItem[]) {
    const pc = peerConnections.get(peerId);
    if (!pc || !pc.remoteDescription) return;
    const lastSeen = seenIceTs.get(peerId) ?? 0;
    let maxTs = lastSeen;
    for (const item of list) {
      if (item.ts <= lastSeen) continue;
      try {
        await pc.addIceCandidate(item.cand);
      }
      catch (e) {
        if (import.meta.dev) console.warn("[voice mesh] addIceCandidate", e);
      }
      if (item.ts > maxTs) maxTs = item.ts;
    }
    seenIceTs.set(peerId, maxTs);
  }

  async function reconcileMesh() {
    const room = myRoomId.value;
    const me = myClientId();
    if (!room || me == null) return;

    const aw = getAwareness();
    if (!aw) return;

    const states = aw.getStates() as Map<number, any>;
    const inRoom = new Set<number>();

    for (const [cid, state] of states.entries()) {
      if (cid === me) continue;
      const v = state?.[FIELD] as LocalVoiceState | undefined;
      if (!v || v.roomId !== room) continue;
      inRoom.add(cid);

      const initiator = me < cid;
      const theirSignals = (state?.[SIGNAL_FIELD] ?? {}) as SignalMap;
      const fromThem = theirSignals[String(me)] ?? {};

      if (initiator) {
        const myOut = readLocalSignals()[String(cid)];
        if (!myOut?.offer) await makeOfferTo(cid);
        if (fromThem.answer) {
          await acceptAnswerFrom(cid, fromThem.answer.sdp, fromThem.answer.ts);
        }
      }
      else if (fromThem.offer) {
        await acceptOfferFrom(cid, fromThem.offer.sdp, fromThem.offer.ts);
      }

      if (fromThem.iceList && fromThem.iceList.length) {
        await drainIceFor(cid, fromThem.iceList);
      }
    }

    // Dispose peers no longer in the room.
    for (const cid of peerConnections.keys()) {
      if (!inRoom.has(cid)) disposePeer(cid);
    }
  }

  function attachAwarenessListener() {
    const aw = getAwareness();
    if (!aw || awarenessRef === aw) return;
    detachAwarenessListener();
    awarenessRef = aw;
    awarenessHandler = () => {
      void reconcileMesh();
    };
    aw.on("update", awarenessHandler);
  }

  function detachAwarenessListener() {
    if (awarenessRef && awarenessHandler) {
      try { awarenessRef.off("update", awarenessHandler); }
      catch {}
    }
    awarenessHandler = null;
    awarenessRef = null;
  }

  function disposeAllPeers() {
    for (const cid of [...peerConnections.keys()]) disposePeer(cid);
    seenIceTs.clear();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async function join(roomId: string) {
    myRoomId.value = roomId;
    // Restore the muted preference from the last session so re-entering a
    // room doesn't surprise users with an open mic.
    let initialMuted = true;
    try {
      const raw = sessionStorage.getItem("atrium:voice:muted");
      if (raw === "false") initialMuted = false;
    }
    catch {}
    myMuted.value = initialMuted;
    mySpeaking.value = false;
    writeLocal({ roomId, muted: initialMuted, speaking: false, joinedAt: Date.now() });
    clearAllSignals();
    try {
      await startMicCapture();
      if (mediaStream) {
        for (const t of mediaStream.getAudioTracks()) t.enabled = !initialMuted;
      }
    }
    catch (e) {
      if (import.meta.dev) console.warn("[voice] mic init failed:", e);
    }
    attachAwarenessListener();
    startLevelLoop();
    // Kick a first reconcile so we dial pre-existing inhabitants.
    void reconcileMesh();
  }

  function leave() {
    myRoomId.value = null;
    writeLocal(null);
    clearAllSignals();
    detachAwarenessListener();
    disposeAllPeers();
    stopLevelLoop();
    stopMicCapture();
  }

  // ── Screen-share lifecycle ─────────────────────────────────────────────
  async function startScreenShare() {
    if (screenStream) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen sharing not supported in this browser");
    }
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    screenSharingLocal.value = true;

    // Add the video track to every existing peer connection.
    for (const [peerId, pc] of peerConnections.entries()) {
      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack) continue;
      const sender = pc.addTrack(videoTrack, screenStream);
      screenSenders.set(peerId, sender);
      // Renegotiate so the receiver picks up the new track.
      void renegotiate(peerId);
    }

    // Auto-stop when the user clicks the browser's "Stop sharing" overlay.
    screenStream.getVideoTracks().forEach((t) => {
      t.addEventListener("ended", () => { void stopScreenShare(); });
    });

    // Broadcast the share flag so peers know to render the screen frame.
    const cur = readLocalState();
    if (cur) writeLocal({ ...cur, screenShare: true });
  }

  async function stopScreenShare() {
    if (!screenStream) return;
    for (const [peerId, sender] of screenSenders.entries()) {
      const pc = peerConnections.get(peerId);
      if (pc) {
        try { pc.removeTrack(sender); }
        catch {}
        void renegotiate(peerId);
      }
    }
    screenSenders.clear();
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
    screenSharingLocal.value = false;
    const cur = readLocalState();
    if (cur) writeLocal({ ...cur, screenShare: false });
  }

  async function renegotiate(peerId: number) {
    const pc = peerConnections.get(peerId);
    if (!pc) return;
    // Only the initiator side re-offers to avoid glare. The other side will
    // pick up the answer when the receiver's reconcileMesh tick runs.
    const me = myClientId();
    if (me == null || me >= peerId) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      updateSignalFor(peerId, (box) => ({
        ...box,
        offer: { sdp: offer.sdp ?? "", type: "offer", ts: Date.now() },
      }));
    }
    catch (e) {
      if (import.meta.dev) console.warn("[voice mesh] renegotiate", e);
    }
  }

  function setMuted(muted: boolean) {
    myMuted.value = muted;
    if (mediaStream) {
      for (const t of mediaStream.getAudioTracks()) t.enabled = !muted;
    }
    try { sessionStorage.setItem("atrium:voice:muted", String(muted)); }
    catch {}
    const cur = readLocalState();
    if (cur) writeLocal({ ...cur, muted });
  }

  function toggleMute() {
    setMuted(!myMuted.value);
  }

  function leaveWithScreenShare() {
    if (screenStream) void stopScreenShare();
    leave();
  }

  return {
    myRoomId,
    myMuted,
    mySpeaking,
    inhabitantsIn,
    countIn,
    levelOf,
    join,
    leave: leaveWithScreenShare,
    setMuted,
    toggleMute,
    // Screen share
    screenSharingLocal,
    remoteScreens,
    startScreenShare,
    stopScreenShare,
  };
}
