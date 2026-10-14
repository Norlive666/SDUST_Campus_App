<template>
  <div class="main-layout">
    <router-view />

    <van-tabbar route fixed active-color="#4F46E5" inactive-color="#94A3B8" class="bottom-tabbar">
      <van-tabbar-item replace to="/timetable" icon="calendar-o">
        课表
      </van-tabbar-item>
      <van-tabbar-item replace to="/grade" icon="bar-chart-o">
        成绩
      </van-tabbar-item>
      <van-tabbar-item replace to="/exam" icon="underway-o">
        考试
      </van-tabbar-item>
      <van-tabbar-item replace to="/profile" icon="user-o">
        我的
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.main-layout {
  min-height: 100vh;
  box-sizing: border-box;
}

.bottom-tabbar {
  border-top: 1px solid #f1f5f9;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.03);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
