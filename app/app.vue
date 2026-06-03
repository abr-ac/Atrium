<script setup lang="ts">
const appConfig = useAppConfig() as {
  ui?: { colors?: { primary?: string, neutral?: string } }
}

onMounted(() => {
  try {
    const saved = sessionStorage.getItem('adabra_theme')
    if (!saved) return
    const { primary, neutral } = JSON.parse(saved) as { primary?: string, neutral?: string }
    if (appConfig.ui?.colors && primary && neutral) {
      appConfig.ui.colors.primary = primary
      appConfig.ui.colors.neutral = neutral
    }
  } catch { /* sessionStorage disabled */ }
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
    </NuxtLayout>
  </UApp>
</template>
