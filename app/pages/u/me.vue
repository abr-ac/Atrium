<script setup lang="ts">
// /u/me — redirect to the signed-in user's profile. Lives as its own route so
// header/sidebar nav can deep-link without knowing the pubkey at render time.

const { publicKeyB64 } = useAbracadabra();

definePageMeta({ middleware: [] });

watchEffect(() => {
  const pk = publicKeyB64.value;
  if (pk) {
    navigateTo(`/u/${pk}`, { replace: true });
  }
});
</script>

<template>
  <div class="atrium-redirect">
    <UIcon name="i-lucide-loader-circle" class="size-5 text-dimmed animate-spin" />
    <p>Loading your profile…</p>
  </div>
</template>

<style scoped>
.atrium-redirect {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 4rem 1rem;
  color: var(--ui-text-dimmed);
  font-size: 0.875rem;
}
</style>
