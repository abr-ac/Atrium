<script setup lang="ts">
// AtriumPoll — embedded in a post body via `![[pollId]]`. Reads the poll
// entry + its option children + per-option vote grandchildren from the
// shared doc-tree, renders ranked bars, toggles the local user's vote by
// creating/deleting a `poll-vote` tree entry under the chosen option.
//
// Composes the same primitives as ReactionStrip — no new server work.

import type { TreeEntry } from "#imports";

const props = defineProps<{
  pollId: string;
}>();

const { doc, publicKeyB64 } = useAbracadabra();
const tree = useChildTree(doc, props.pollId);

const pollEntry = computed<TreeEntry | null>(() =>
  tree.entries.value.find((e) => e.id === props.pollId) ?? null,
);

const pollMeta = computed(() => (pollEntry.value?.meta ?? {}) as Record<string, unknown>);

const question = computed(() => {
  const q = (pollMeta.value.pollQuestion as string) ?? "";
  return q || pollEntry.value?.label || "Poll";
});

const multi = computed(() => Boolean(pollMeta.value.pollMulti));
const closesAt = computed(() => (pollMeta.value.pollClosesAt as number) ?? null);
const anonymous = computed(() => Boolean(pollMeta.value.pollAnonymous));

const closed = computed(() => {
  const at = closesAt.value;
  return !!at && Date.now() > at;
});

const options = computed<TreeEntry[]>(() =>
  tree.entries.value
    .filter((e) => e.parentId === props.pollId && e.type === "poll-option")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
);

interface Vote {
  id: string;
  author: string;
  optionId: string;
}

const votes = computed<Vote[]>(() => {
  const optIds = new Set(options.value.map((o) => o.id));
  const out: Vote[] = [];
  for (const e of tree.entries.value) {
    if (e.type !== "poll-vote") continue;
    if (!e.parentId || !optIds.has(e.parentId)) continue;
    const author = (e.meta as any)?.author as string | undefined;
    if (!author) continue;
    out.push({ id: e.id, author, optionId: e.parentId });
  }
  return out;
});

const totalVoters = computed(() => {
  // In multi mode the same author can have multiple votes; "voters" counts
  // distinct authors. The bar percentages still divide by total votes so
  // multi-choice doesn't artificially shrink each bar.
  return new Set(votes.value.map((v) => v.author)).size;
});

const totalVotes = computed(() => votes.value.length);

interface Tally {
  option: TreeEntry;
  count: number;
  pct: number;
  mineVoteId: string | null;
  voters: string[];
}

const tally = computed<Tally[]>(() => {
  const me = publicKeyB64.value;
  const rows: Tally[] = [];
  for (const opt of options.value) {
    const optVotes = votes.value.filter((v) => v.optionId === opt.id);
    const mine = optVotes.find((v) => v.author === me) ?? null;
    rows.push({
      option: opt,
      count: optVotes.length,
      pct: totalVotes.value ? (optVotes.length / totalVotes.value) * 100 : 0,
      mineVoteId: mine?.id ?? null,
      voters: optVotes.map((v) => v.author),
    });
  }
  return rows;
});

const winningCount = computed(() => {
  let max = 0;
  for (const t of tally.value) if (t.count > max) max = t.count;
  return max;
});

function toggleVote(opt: TreeEntry) {
  if (closed.value) return;
  const me = publicKeyB64.value;
  if (!me) return;
  const existing = votes.value.find((v) => v.author === me && v.optionId === opt.id);
  if (existing) {
    tree.deleteEntry(existing.id);
    return;
  }
  if (!multi.value) {
    // Single-choice: remove any previous vote of mine under this poll.
    for (const v of votes.value) {
      if (v.author === me) tree.deleteEntry(v.id);
    }
  }
  const id = tree.createChild(opt.id, "", "poll-vote");
  tree.updateMeta(id, { author: me } as Record<string, unknown>);
}

const { peers } = useAwarenessPeers();
function voterLabel(pubkey: string): string {
  if (pubkey === publicKeyB64.value) return "You";
  const p = peers.value.find((x) => x.user?.publicKey === pubkey);
  return p?.user?.name ?? pubkey.slice(0, 8);
}
function voterColor(pubkey: string): string {
  const p = peers.value.find((x) => x.user?.publicKey === pubkey);
  return p?.user?.color ?? "#888";
}

function closesInLabel(): string {
  const at = closesAt.value;
  if (!at) return "";
  const diff = at - Date.now();
  if (diff <= 0) return "Closed";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `Closes in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Closes in ${hr}h`;
  return `Closes in ${Math.floor(hr / 24)}d`;
}

const expandedVoters = ref<Set<string>>(new Set());
function toggleVoters(optId: string) {
  const next = new Set(expandedVoters.value);
  if (next.has(optId)) next.delete(optId);
  else next.add(optId);
  expandedVoters.value = next;
}
</script>

<template>
  <section v-if="pollEntry" class="atrium-poll" :class="{ 'atrium-poll--closed': closed }">
    <header class="atrium-poll__head">
      <UIcon name="i-lucide-bar-chart-3" class="size-4 text-primary" />
      <h3 class="atrium-poll__question">{{ question }}</h3>
      <UBadge v-if="multi" color="primary" variant="subtle" size="sm">
        Multi-choice
      </UBadge>
      <UBadge v-if="closed" color="neutral" variant="subtle" size="sm">
        Closed
      </UBadge>
    </header>

    <ul class="atrium-poll__options">
      <li v-for="t in tally" :key="t.option.id">
        <button
          type="button"
          class="atrium-poll__option"
          :class="{
            'atrium-poll__option--mine': !!t.mineVoteId,
            'atrium-poll__option--winning': t.count > 0 && t.count === winningCount,
            'atrium-poll__option--disabled': closed,
          }"
          :aria-pressed="!!t.mineVoteId"
          :disabled="closed"
          @click="toggleVote(t.option)"
        >
          <span class="atrium-poll__bar" :style="{ width: t.pct + '%' }" aria-hidden="true" />
          <span class="atrium-poll__row">
            <span class="atrium-poll__check">
              <UIcon
                v-if="t.mineVoteId"
                name="i-lucide-check-circle-2"
                class="size-4 text-primary"
              />
              <UIcon
                v-else
                name="i-lucide-circle"
                class="size-4 text-dimmed"
              />
            </span>
            <span class="atrium-poll__label">{{ t.option.label || "(option)" }}</span>
            <span class="atrium-poll__count">
              {{ t.count }}<span class="atrium-poll__pct">· {{ t.pct.toFixed(0) }}%</span>
            </span>
          </span>
        </button>
        <div v-if="!anonymous && t.voters.length" class="atrium-poll__voters">
          <button
            type="button"
            class="atrium-poll__voters-toggle"
            @click="toggleVoters(t.option.id)"
          >
            <UIcon
              :name="expandedVoters.has(t.option.id) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="size-3"
            />
            {{ t.voters.length }} {{ t.voters.length === 1 ? "voter" : "voters" }}
          </button>
          <ul v-if="expandedVoters.has(t.option.id)" class="atrium-poll__voter-list">
            <li v-for="pk in t.voters" :key="pk">
              <NuxtLink :to="`/u/${pk}`" class="atrium-poll__voter">
                <span class="atrium-poll__voter-dot" :style="{ background: voterColor(pk) }" />
                {{ voterLabel(pk) }}
              </NuxtLink>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <footer class="atrium-poll__foot">
      <span>{{ totalVoters }} {{ totalVoters === 1 ? "voter" : "voters" }}</span>
      <span v-if="multi && totalVotes !== totalVoters" class="atrium-poll__sub">
        · {{ totalVotes }} votes cast
      </span>
      <span v-if="closesAt" class="atrium-poll__sub">· {{ closesInLabel() }}</span>
    </footer>
  </section>
  <div v-else class="atrium-poll atrium-poll--missing">
    <UIcon name="i-lucide-bar-chart-3" class="size-4 text-dimmed" />
    <span>Poll not loaded yet…</span>
  </div>
</template>

<style scoped>
.atrium-poll {
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-md, 0.65rem);
  background: var(--ui-bg);
  margin: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem 0.85rem;
}
.atrium-poll--missing {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  color: var(--ui-text-dimmed);
  font-size: 0.825rem;
}
.atrium-poll__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.atrium-poll__question {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.3;
  flex: 1;
  min-width: 0;
}
.atrium-poll__options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.atrium-poll__option {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid var(--ui-border);
  border-radius: var(--atrium-radius-sm, 0.4rem);
  background: var(--ui-bg-elevated);
  padding: 0.5rem 0.7rem;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.atrium-poll__option:hover:not(.atrium-poll__option--disabled) {
  border-color: color-mix(in srgb, var(--ui-primary) 45%, var(--ui-border));
}
.atrium-poll__option--mine {
  border-color: color-mix(in srgb, var(--ui-primary) 60%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-primary) 8%, var(--ui-bg));
}
.atrium-poll__option--winning .atrium-poll__bar {
  background: color-mix(in srgb, var(--ui-primary) 22%, transparent);
}
.atrium-poll__option--disabled {
  cursor: default;
  opacity: 0.75;
}
.atrium-poll__bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
  transition: width 0.3s ease;
  pointer-events: none;
}
.atrium-poll__row {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.875rem;
}
.atrium-poll__label {
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.atrium-poll__count {
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  color: var(--ui-text-dimmed);
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}
.atrium-poll__pct {
  font-size: 0.72rem;
  opacity: 0.8;
}
.atrium-poll__voters {
  padding: 0.25rem 0.1rem 0;
}
.atrium-poll__voters-toggle {
  font-size: 0.72rem;
  color: var(--ui-text-dimmed);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}
.atrium-poll__voters-toggle:hover {
  color: var(--ui-primary);
}
.atrium-poll__voter-list {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
}
.atrium-poll__voter {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: var(--ui-text-dimmed);
  text-decoration: none;
  padding: 0.1rem 0.35rem;
  border-radius: 9999px;
  background: var(--ui-bg-elevated);
}
.atrium-poll__voter:hover {
  color: var(--ui-primary);
}
.atrium-poll__voter-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
}
.atrium-poll__foot {
  font-size: 0.72rem;
  color: var(--ui-text-dimmed);
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.atrium-poll__sub {
  opacity: 0.85;
}
</style>
