<template>
  <div class="main-layout">
    <router-view />

    <van-tabbar
      route
      fixed
      safe-area-inset-bottom
      active-color="#6d5dd3"
      inactive-color="#989daf"
      class="bottom-tabbar"
    >
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
  min-height: 100dvh;
  max-width: 960px;
  margin: 0 auto;
  box-sizing: border-box;
}
.bottom-tabbar {
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 960px;
  height: 62px;
  border-top: 1px solid #e9eaf2;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 -4px 24px #28224704;
}
.bottom-tabbar :deep(.van-tabbar-item) {
  gap: 3px;
  background: transparent;
}
.bottom-tabbar :deep(.van-tabbar-item__icon) {
  font-size: 22px;
  margin-bottom: 3px;
  padding: 3px 16px;
  border-radius: 12px;
}
.bottom-tabbar :deep(.van-tabbar-item--active .van-tabbar-item__icon) {
  background: #eeebfc;
}
.bottom-tabbar :deep(.van-tabbar-item__text) {
  font-size: 11px;
  font-weight: 600;
}
</style>
