// useAtriumReputation — derive a karma score from reactions on a user's posts.
//
// Karma rules (intentionally simple for v0):
//   • Each reaction this user authored a post for = +1
//   • Each thread this user opened = +2 base (encourages opening conversations)
//   • Each reply they wrote = +1 base
//   • Reactions specifically on threads this user opened weigh 2x (driver karma)
//
// Returns a reactive { karma, breakdown, level, badge } structure. Levels
// follow a simple log curve so a new user reaching 5 karma feels rewarded
// without inflating the top tier.

export interface ReputationBreakdown {
  threads: number;
  replies: number;
  reactionsReceived: number;
  reactionsOnThreads: number;
}

export interface Reputation {
  karma: number;
  breakdown: ReputationBreakdown;
  level: number;
  badge: string;
  badgeIcon: string;
}

function levelFor(karma: number): { level: number; badge: string; badgeIcon: string } {
  if (karma >= 200) return { level: 5, badge: "Pillar", badgeIcon: "i-lucide-crown" };
  if (karma >= 80) return { level: 4, badge: "Voice", badgeIcon: "i-lucide-mic" };
  if (karma >= 30) return { level: 3, badge: "Regular", badgeIcon: "i-lucide-flame" };
  if (karma >= 10) return { level: 2, badge: "Contributor", badgeIcon: "i-lucide-sprout" };
  if (karma >= 1) return { level: 1, badge: "Newcomer", badgeIcon: "i-lucide-seedling" };
  return { level: 0, badge: "Lurker", badgeIcon: "i-lucide-eye" };
}

export function useAtriumReputation(pubkey: MaybeRefOrGetter<string | null | undefined>) {
  const nav = useAtriumNav();

  return computed<Reputation>(() => {
    const key = toValue(pubkey);
    if (!key) {
      return {
        karma: 0,
        breakdown: { threads: 0, replies: 0, reactionsReceived: 0, reactionsOnThreads: 0 },
        ...levelFor(0),
      };
    }
    const entries = nav.allEntries.value;
    let threads = 0;
    let replies = 0;
    let reactionsReceived = 0;
    let reactionsOnThreads = 0;

    // First pass: every post by this author counts toward the base, and we
    // record the post id so the second pass can credit reactions on it.
    const myPostIds = new Set<string>();
    const myThreadIds = new Set<string>();
    for (const e of entries) {
      const meta = (e.meta ?? {}) as Record<string, unknown>;
      if (meta.author !== key) continue;
      if (e.type === "reaction") continue;
      if (e.type === "thread") {
        threads += 1;
        myThreadIds.add(e.id);
      }
      else {
        replies += 1;
      }
      myPostIds.add(e.id);
    }

    // Second pass: count reactions whose parent is one of mine.
    for (const e of entries) {
      if (e.type !== "reaction") continue;
      if (!e.parentId) continue;
      if (!myPostIds.has(e.parentId)) continue;
      reactionsReceived += 1;
      if (myThreadIds.has(e.parentId)) reactionsOnThreads += 1;
    }

    const karma
      = threads * 2
      + replies * 1
      + reactionsReceived
      + reactionsOnThreads; // double-counts the thread bonus

    return {
      karma,
      breakdown: { threads, replies, reactionsReceived, reactionsOnThreads },
      ...levelFor(karma),
    };
  });
}
