<template>
  <van-dialog v-model:show="store.visible" title="发现新版本" :show-confirm-button="false" :close-on-click-overlay="false">
    <div v-if="store.update" class="update-notice">
      <div class="update-version">v{{ store.update.currentVersion }} <span>→</span> v{{ store.update.version }}</div>
      <p class="update-notes">{{ store.update.notes || "新版本已发布，欢迎更新体验。" }}</p>
      <a v-if="store.update.downloadUrl" class="download-link" :href="store.update.downloadUrl" target="_blank" rel="noopener noreferrer" @click.prevent="open(store.update.downloadUrl)">
        <van-icon name="down" /> 下载 Android 安装包
        <small>{{ store.update.assetName }}</small>
      </a>
      <p v-else class="update-tip">当前版本未提供可直接选择的安装包，请到发布页查看下载选项。</p>
      <a class="release-link" :href="store.update.releaseUrl" target="_blank" rel="noopener noreferrer" @click.prevent="open(store.update.releaseUrl)">查看 GitHub 发布页 <van-icon name="arrow" /></a>
      <van-button block round @click="store.visible = false">稍后再说</van-button>
    </div>
  </van-dialog>
</template>
<script setup lang="ts">
import { showToast } from "vant";
import { useUpdateStore } from "../stores/update";
import { openUpdateUrl } from "../services/app-update";
const store = useUpdateStore();
const open = async (url: string) => {
  try { await openUpdateUrl(url); }
  catch (_) { showToast("打开链接失败，请稍后重试"); }
};
</script>
<style scoped>
.update-notice { padding: 10px 24px 24px; text-align: left; }
.update-version { color: #6d5dd3; font-size: 18px; font-weight: 700; text-align: center; }
.update-version span { margin: 0 8px; color: #989bad; }
.update-notes { max-height: 25vh; overflow-y: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: #50596f; font-size: 13px; line-height: 1.7; margin: 18px 0; }
.update-tip { color: #7d8498; font-size: 12px; line-height: 1.6; }
.download-link { display: block; padding: 13px; border-radius: 14px; background: #6d5dd3; color: white; text-align: center; font-size: 14px; font-weight: 600; text-decoration: none; }
.download-link small { display: block; overflow-wrap: anywhere; margin-top: 5px; font-size: 10px; font-weight: 400; opacity: .85; }
.release-link { display: block; margin: 16px 0; color: #6d5dd3; font-size: 13px; text-align: center; text-decoration: none; }
</style>
