<template>
  <header class="screen-header">
    <div class="screen-heading">
      <p class="screen-eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}<span></span></h1>
      <p v-if="subtitle" class="screen-subtitle">{{ subtitle }}</p>
    </div>
    <div class="screen-actions"><slot /></div>
  </header>
</template>
<script setup lang="ts">
defineProps<{ title: string; eyebrow: string; subtitle?: string }>();
</script>
<style scoped>
.screen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.screen-heading {
  min-width: 0;
}
.screen-eyebrow {
  font-size: 11px;
  color: #85899e;
  letter-spacing: 1.4px;
  margin: 0 0 8px;
}
h1 {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: -1px;
  margin: 0;
}
h1 span {
  width: 7px;
  height: 7px;
  background: #9283e6;
  border-radius: 50%;
}
.screen-subtitle {
  font-size: 12px;
  color: #85899e;
  margin: 9px 0 0;
  line-height: 1.6;
}
.screen-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
