<template>
  <div id="app-root">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { useUserStore } from './stores/user';
import { useTimetableStore } from './stores/timetable';

const userStore = useUserStore();
const timetableStore = useTimetableStore();

onMounted(async () => {
  userStore.init();
  timetableStore.init();

  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    } catch (_) {}
  }
});
</script>

<style>
:root {
  --van-primary-color: #4f46e5;
  --van-success-color: #10b981;
  --van-danger-color: #ef4444;
  --van-warning-color: #f59e0b;
}

body {
  margin: 0;
  padding: 0;
  background-color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

#app-root {
  min-height: 100vh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
