<template>
  <main class="profile-page campus-page">
    <PageHeader
      eyebrow="校园账户"
      title="我的"
      subtitle="你的学习生活，由你安排"
    />
    <section class="user-card">
      <div class="user-card-top">
        <span class="avatar-box">{{ userStore.name.slice(-2) }}</span>
        <div class="user-meta">
          <h2>{{ userStore.name }}</h2>
          <p>{{ userStore.account || "未填写学号" }}</p>
        </div>
        <span class="login-tag"><i></i> 已登录</span>
      </div>
      <div class="user-school">
        <van-icon aria-hidden="true" name="hotel-o" /><span>{{
          userStore.college || "山东科技大学"
        }}</span>
      </div>
      <p class="user-detail">
        {{ userStore.major || "本科专业"
        }}<span v-if="userStore.className"> · {{ userStore.className }}</span>
      </p>
    </section>
    <section class="academic-overview" aria-label="当前教务设置">
      <button @click="showTermSheet = true">
        <span><van-icon aria-hidden="true" name="calendar-o" /> 当前学期</span
        ><strong>{{ userStore.curTerm }}</strong
        ><small>切换学期 <van-icon aria-hidden="true" name="arrow" /></small></button
      ><button @click="showWeekSheet = true">
        <span><van-icon aria-hidden="true" name="underway-o" /> 教学进度</span
        ><strong>第 {{ userStore.curWeek }} <em>周</em></strong
        ><small>校准周次 <van-icon aria-hidden="true" name="arrow" /></small>
      </button>
    </section>
    <div class="section-heading">
      <h2>教务与数据</h2>
      <span>按需管理，随时同步</span>
    </div>
    <div class="settings-card">
      <button
        class="setting-row"
        :disabled="syncing"
        @click="onSyncStudentInfo"
      >
        <span class="setting-icon lavender"><van-icon aria-hidden="true" name="replay" /></span
        ><span class="setting-copy"
          ><strong>同步学籍信息</strong
          ><small>更新姓名、院系和班级</small></span
        ><van-loading v-if="syncing" size="17" /><van-icon
          v-else
          name="arrow"
          class="row-arrow"
        /></button
      ><button class="setting-row" @click="onClearCache">
        <span class="setting-icon sage"><van-icon aria-hidden="true" name="delete-o" /></span
        ><span class="setting-copy"
          ><strong>清理离线缓存</strong
          ><small>清除课表、成绩和考试的本地副本</small></span
        ><van-icon aria-hidden="true" name="arrow" class="row-arrow" />
      </button>
    </div>
    <div class="section-heading"><h2>关于应用</h2></div>
    <div class="settings-card">
      <button class="setting-row" :disabled="updateStore.checking" @click="onCheckUpdate">
        <span class="setting-icon lavender"><van-icon aria-hidden="true" name="upgrade" /></span>
        <span class="setting-copy"><strong>检查更新</strong><small>{{ updateStore.checking ? "正在检查新版本…" : "检查是否有新版本" }}</small></span>
        <van-loading v-if="updateStore.checking" size="17" /><van-icon v-else aria-hidden="true" name="arrow" class="row-arrow" />
      </button>
      <button class="setting-row" @click="showAboutDialog = true">
        <span class="setting-icon sand"><van-icon aria-hidden="true" name="info-o" /></span
        ><span class="setting-copy"
          ><strong>关于山科小站</strong
          ><small>陪你度过每一个校园日常</small></span
        ><span class="version-text">v{{ version }}</span
        ><van-icon aria-hidden="true" name="arrow" class="row-arrow" />
      </button>
    </div>
    <div v-if="pwa.web" class="settings-card pwa-install-card">
      <button class="setting-row" @click="showInstall = true">
        <span class="setting-icon lavender"><van-icon name="add-square" /></span>
        <span class="setting-copy"><strong>添加到桌面</strong><small>{{ pwa.ready ? "已可离线打开，断网可查看缓存" : pwa.error ? "离线缓存准备失败，请联网重试" : "首次联网后准备离线缓存" }}</small></span>
        <van-icon name="arrow" class="row-arrow" />
      </button>
    </div>
    <van-dialog v-model:show="showInstall" title="添加到桌面" confirm-button-text="知道了">
      <div class="install-help"><p>苹果手机：使用 Safari 打开本站，点击分享 → 添加到主屏幕；如有“作为网页 App 打开”，请开启。</p><p>安卓浏览器：在浏览器菜单中选择“安装应用”或“添加到主屏幕”。</p><p>请先联网完成登录和同步，并等待显示“已可离线打开”。断网后可查看已缓存的课表、成绩和考试；获取新数据仍需联网。</p></div>
    </van-dialog>
    <div class="offline-note">
      <van-icon aria-hidden="true" name="shield-o" />
      <p>已同步的内容会自动保存在本机，<br />再次打开即可查看。</p>
    </div>
    <button class="logout-button" @click="onLogout">
      <van-icon aria-hidden="true" name="sign" /> 退出当前账号
    </button>
    <p class="profile-footer">山科小站 <span>·</span> 专注你的校园日常</p>
    <van-action-sheet
      v-model:show="showTermSheet"
      title="选择当前学期"
      :actions="termOptions"
      cancel-text="取消"
      close-on-click-action
      @select="onSelectTerm"
    />
    <van-popup
      v-model:show="showWeekSheet"
      round
      position="bottom"
      safe-area-inset-bottom
      ><div class="picker-header">
        <div>
          <h2>校准教学周</h2>
          <p>按学校实际教学进度调整</p>
        </div>
        <button aria-label="关闭周次选择" @click="showWeekSheet = false">
          <van-icon aria-hidden="true" name="cross" />
        </button>
      </div>
      <div class="week-grid">
        <button
          v-for="w in 25"
          :key="w"
          class="week-chip"
          :class="{ 'chip-active': w === userStore.curWeek }"
          :aria-pressed="w === userStore.curWeek"
          @click="onSelectWeek(w)"
        >
          {{ w }}<span>周</span>
        </button>
      </div></van-popup
    >
    <van-dialog
      v-model:show="showAboutDialog"
      title="关于山科小站"
      confirm-button-text="知道了"
      ><div class="about-content">
        <span class="about-mark"><van-icon aria-hidden="true" name="notes-o" /></span>
        <h3>把校园日常，安排得刚刚好。</h3>
        <p>
          为山东科技大学学生打造的教务助手，在一个地方查看课表、课程成绩与考试安排。
        </p>
        <div class="about-features">
          <span><van-icon aria-hidden="true" name="calendar-o" /> 课表日程</span
          ><span><van-icon aria-hidden="true" name="bar-chart-o" /> 成绩查询</span
          ><span><van-icon aria-hidden="true" name="underway-o" /> 考试安排</span>
        </div>
        <p class="about-credit">基于 WindrunnerMax/SHST 开源项目构建</p>
        <p class="about-version">山科小站 v{{ version }}</p>
      </div></van-dialog
    >
  </main>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast, showConfirmDialog } from "vant";
import { useUserStore } from "../stores/user";
import { useTimetableStore } from "../stores/timetable";
import { api } from "../services/api";
import PageHeader from "../components/PageHeader.vue";
import { bundledVersion, getInstalledVersion } from "../services/app-update";
import { useUpdateStore } from "../stores/update";
import { Capacitor } from "@capacitor/core";
import { pwa, checkWebUpdate } from "../services/pwa";
const showInstall = ref(false);
const onCheckUpdate = async () => {
  if (Capacitor.isNativePlatform()) return updateStore.check(true);
  if (!navigator.onLine) return showToast("当前离线，联网后可检查更新");
  try {
    await checkWebUpdate();
    showToast(pwa.updateAvailable ? "发现网页新版本，请点击下方立即刷新" : "已检查网页版本，可继续使用");
  } catch (_) { showToast("检查更新失败，请稍后重试"); }
};
const version = ref(bundledVersion);
const updateStore = useUpdateStore();
onMounted(async () => {
  try { version.value = await getInstalledVersion(); } catch (_) {}
});
const router = useRouter();
const userStore = useUserStore();
const timetableStore = useTimetableStore();
const showTermSheet = ref(false);
const showWeekSheet = ref(false);
const showAboutDialog = ref(false);
const syncing = ref(false);
const termOptions = computed(() => {
  const current = userStore.curTerm;
  const year = parseInt(current.split("-")[0], 10) || new Date().getFullYear();
  const terms = new Set([current]);
  for (let y = year; y >= year - 5; y--) {
    terms.add(`${y}-${y + 1}-1`);
    terms.add(`${y}-${y + 1}-2`);
  }
  return [...terms]
    .filter(Boolean)
    .sort()
    .reverse()
    .map((value) => ({
      name: value + (value === current ? " · 使用中" : ""),
      value,
    }));
});
const onSyncStudentInfo = async () => {
  if (syncing.value) return;
  syncing.value = true;
  try {
    const info = await api.getStudentInfo();
    if (info && (info.name || info.college)) {
      userStore.updateStudentInfo(info);
      showToast({ type: "success", message: "学籍信息已更新" });
    } else showToast("暂未获取到新信息，已保留原有资料");
  } catch (_) {
    showToast("同步失败，请检查校园网连接");
  } finally {
    syncing.value = false;
  }
};
const onSelectTerm = async (action: { value: string }) => {
  userStore.setCurTerm(action.value);
  try {
    await timetableStore.fetchTimetable(action.value);
    showToast("学期已切换，课表已同步");
  } catch (_) {
    showToast("学期已切换，同步失败，已保留原有课表");
  }
};
const onSelectWeek = (w: number) => {
  userStore.setCurWeek(w);
  timetableStore.selectedWeek = w;
  showWeekSheet.value = false;
  showToast(`已调整为第 ${w} 周`);
};
const onClearCache = async () => {
  try {
    await showConfirmDialog({
      title: "清理离线缓存？",
      message:
        "将清除本机保存的课表、成绩和考试记录，下次查看时重新同步。账号登录状态会保留。",
      confirmButtonText: "清理缓存",
      cancelButtonText: "保留",
    });
  } catch (_) {
    return;
  }
  for (const key of ["shst_timetable", "shst_grades", "shst_exams"])
    localStorage.removeItem(key);
  timetableStore.courses = [];
  showToast({ type: "success", message: "离线缓存已清理" });
};
const onLogout = async () => {
  try {
    await showConfirmDialog({
      title: "退出当前账号？",
      message: "将清除本机的登录凭据和教务缓存。下次使用需要重新登录。",
      confirmButtonText: "退出账号",
      cancelButtonText: "继续使用",
    });
  } catch (_) {
    return;
  }
  try {
    await userStore.logout();
  } catch (_) {
    showToast("已退出，凭据清理未完成，请稍后重试");
  }
  router.replace("/login");
};
</script>
<style scoped>
.install-help { padding: 0 24px 20px; font-size: 13px; line-height: 1.8; color: #626b80; }
.pwa-install-card { margin-top: 16px; }
.user-card {
  border-radius: 22px;
  padding: 22px 20px;
  border: 1px solid #e4dcf4;
  background: linear-gradient(120deg, #eee9fa, #f7f3fb);
}
.user-card-top {
  display: flex;
  align-items: center;
  gap: 13px;
}
.avatar-box {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 3px solid #fff9;
  border-radius: 18px;
  background: #dfd4f1;
  color: #937cb3;
  font-size: 16px;
  font-weight: 650;
}
.user-meta {
  flex: 1;
  min-width: 0;
}
.user-meta h2 {
  margin: 0 0 7px;
  font-size: 21px;
  line-height: 1.4;
  color: #70607f;
  overflow-wrap: anywhere;
}
.user-meta p {
  margin: 0;
  font-size: 11px;
  color: #a092af;
  word-break: break-all;
}
.login-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #a190b3;
  font-size: 9px;
  flex-shrink: 0;
  padding: 5px 7px;
  border: 1px solid #e0d6ee;
  border-radius: 7px;
}
.login-tag i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #b19ec9;
}
.user-school {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding-top: 18px;
  margin-top: 20px;
  border-top: 1px solid #e1d8ee;
  color: #847292;
  font-size: 12px;
  line-height: 1.6;
}
.user-school .van-icon {
  margin-top: 2px;
}
.user-detail {
  margin: 6px 0 0 19px;
  color: #90809f;
  font-size: 11px;
  line-height: 1.7;
}
.academic-overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.academic-overview button {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid #e7e8f0;
  border-radius: 17px;
  background: #fff;
  padding: 17px 15px;
  gap: 13px;
  text-align: left;
}
.academic-overview button > span {
  font-size: 11px;
  color: #8c839e;
}
.academic-overview .van-icon {
  margin-right: 4px;
}
.academic-overview strong {
  color: #7c708f;
  font-size: 17px;
  font-weight: 600;
}
.academic-overview strong em {
  font-style: normal;
  font-size: 11px;
  font-weight: 400;
}
.academic-overview small {
  font-size: 9px;
  color: #b3acbf;
}
.academic-overview small .van-icon {
  margin-left: 4px;
}
.settings-card {
  background: white;
  border: 1px solid #e9eaf2;
  border-radius: 18px;
  overflow: hidden;
  padding: 0 16px;
}
.setting-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border: 0;
  border-top: 1px solid #f0eff5;
  background: none;
  padding: 17px 0;
  text-align: left;
  color: inherit;
}
.setting-row:first-child {
  border: 0;
}
.setting-icon {
  width: 37px;
  height: 37px;
  border-radius: 12px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 18px;
}
.lavender {
  color: #ab96c9;
  background: #f1ecfa;
}
.sage {
  color: #a0b5a5;
  background: #f0f5f1;
}
.sand {
  color: #c4ab87;
  background: #f9f3e9;
}
.setting-copy {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 7px;
}
.setting-copy strong {
  font-size: 14px;
  font-weight: 550;
  color: #656578;
}
.setting-copy small {
  font-size: 10px;
  color: #8b869c;
  line-height: 1.6;
}
.row-arrow {
  color: #cbc7d4;
  font-size: 11px;
  flex-shrink: 0;
}
.version-text {
  color: #b3acbf;
  font-size: 9px;
}
.offline-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin: 24px 0;
  color: #b1a8c1;
}
.offline-note > .van-icon {
  font-size: 21px;
}
.offline-note p {
  margin: 0;
  font-size: 10px;
  line-height: 1.8;
}
.logout-button {
  width: 100%;
  display: flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  border: 1px solid #ece5e9;
  color: #987584;
  border-radius: 13px;
  height: 47px;
  background: #fff;
  font-size: 12px;
}
.profile-footer {
  color: #bbb4c7;
  font-size: 9px;
  letter-spacing: 0.5px;
  margin-top: 24px;
  text-align: center;
}
.profile-footer span {
  margin: 0 6px;
}
.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 24px 20px;
}
.picker-header h2 {
  font-size: 19px;
  margin: 0 0 8px;
}
.picker-header p {
  color: #aaa1b8;
  font-size: 11px;
  margin: 0;
}
.picker-header button {
  display: grid;
  place-items: center;
  border: 0;
  background: #f4f1f9;
  color: #a69ab8;
  border-radius: 50%;
  width: 32px;
  height: 32px;
}
.week-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 9px;
  padding: 0 24px 28px;
  max-height: 50vh;
  overflow: auto;
}
.week-chip {
  border: 1px solid #eeebf5;
  border-radius: 12px;
  min-height: 50px;
  padding: 10px 2px;
  background: #faf8fd;
  color: #a798ba;
  font-size: 16px;
}
.week-chip span {
  font-size: 8px;
  margin-left: 3px;
}
.chip-active {
  background: #8b75ce;
  border-color: #8b75ce;
  color: white;
}
.about-content {
  padding: 20px 24px;
  text-align: center;
}
.about-mark {
  display: grid;
  place-items: center;
  width: 55px;
  height: 55px;
  margin: 0 auto 18px;
  border-radius: 18px;
  background: #eee7fa;
  color: #a38aca;
  font-size: 26px;
}
.about-content h3 {
  font-size: 14px;
  font-weight: 600;
  color: #867294;
}
.about-content p {
  font-size: 11px;
  line-height: 1.9;
  color: #aaa0b6;
}
.about-features {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 20px 0;
  font-size: 9px;
  color: #a78ebf;
}
.about-features .van-icon {
  display: block;
  font-size: 20px;
  margin-bottom: 8px;
}
.about-content .about-credit {
  font-size: 9px;
  margin-top: 24px;
}
.about-content .about-version {
  font-size: 10px;
  color: #b7abca;
}
@media (max-width: 359px) {
  .user-card {
    padding: 20px 16px;
  }
  .academic-overview strong {
    font-size: 15px;
  }
  .setting-copy small {
    font-size: 8px;
  }
}
</style>
