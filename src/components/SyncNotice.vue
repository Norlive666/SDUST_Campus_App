<template>
  <div v-if="message" class="sync-notice" role="status">
    <van-icon aria-hidden="true" name="info-o" /><span>{{ message }}</span
    ><router-link v-if="needsLogin" to="/login?reauth=1"
      >重新验证<van-icon aria-hidden="true" name="arrow"
    /></router-link>
  </div>
</template>
<script setup lang="ts">
defineProps<{ message: string; needsLogin?: boolean }>();
</script>
<style scoped>
.sync-notice {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  margin-bottom: 18px;
  padding: 13px 14px;
  border-radius: 14px;
  background: #fff4e6;
  color: #975b16;
  font-size: 12px;
  line-height: 1.65;
}
.sync-notice > .van-icon {
  margin-top: 3px;
}
.sync-notice span {
  flex: 1;
  min-width: 0;
}
.sync-notice a {
  flex-shrink: 0;
  color: #6151c8;
  font-weight: 600;
}
</style>
