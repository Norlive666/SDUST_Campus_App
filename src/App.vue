<template>
  <div id="app-root">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";
import { useUserStore } from "./stores/user";
import { useTimetableStore } from "./stores/timetable";

const userStore = useUserStore();
const timetableStore = useTimetableStore();

onMounted(async () => {
  userStore.init();
  timetableStore.init();

  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: "#f6f7fb" });
    } catch (_) {}
  }
});
</script>

<style>
:root {
  --van-primary-color: #6d5dd3;
  --van-text-color: #282f47;
  --van-cell-group-inset-radius: 16px;
  --van-dialog-radius: 22px;
  --van-button-normal-font-size: 14px;
  --van-success-color: #10b981;
  --van-danger-color: #ef4444;
  --van-warning-color: #f59e0b;
}

body {
  margin: 0;
  padding: 0;
  background-color: #f6f7fb;
  color: #282f47;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

#app-root {
  min-height: 100vh;
  padding-top: env(safe-area-inset-top);
}
button,
input {
  font: inherit;
}
* {
  box-sizing: border-box;
}
.grade-page,
.exam-page,
.profile-page {
  padding-bottom: calc(90px + env(safe-area-inset-bottom)) !important;
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
