<template>
  <div v-if="pwa.web && (!pwa.online || pwa.updateAvailable)" class="pwa-status" role="status">
    <span>{{ !pwa.online ? "离线模式 · 查看已缓存的数据" : "网页有新版本，刷新即可更新" }}</span>
    <button v-if="pwa.online && pwa.updateAvailable" @click="activateWebUpdate">立即刷新</button>
  </div>
</template>
<script setup lang="ts">
import { pwa, activateWebUpdate } from "../services/pwa";
</script>
<style scoped>
.pwa-status { position: fixed; bottom: calc(78px + env(safe-area-inset-bottom)); left: 16px; right: 16px; z-index: 1800; max-width: 520px; margin: auto; padding: 12px 16px; border-radius: 14px; background: #30284d; color: white; box-shadow: 0 6px 24px #28203d25; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; }
.pwa-status button { flex-shrink: 0; padding: 7px 10px; border: 0; border-radius: 9px; color: #5443ae; background: #f0ebff; }
</style>
