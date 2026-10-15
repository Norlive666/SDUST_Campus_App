<template>
  <div class="profile-page">
    <!-- 用户个人信息卡片 -->
    <div class="user-card">
      <div class="avatar-box">
        <van-icon name="manager" class="avatar-icon" />
      </div>
      <div class="user-meta">
        <div class="name-row">
          <span class="user-name">{{ userStore.name }}</span>
          <van-tag v-if="userStore.isMockMode" type="warning" size="medium"
            >演示模式</van-tag
          >
          <van-tag v-else type="success" size="medium">已认证</van-tag>
        </div>
        <div class="user-detail">
          {{ userStore.college }} · {{ userStore.major || "全日制学生" }}
        </div>
        <div class="user-id">
          <span>学号: {{ userStore.account || "未登录" }}</span>
          <span v-if="userStore.className" class="class-name"
            >（{{ userStore.className }}）</span
          >
        </div>
      </div>
    </div>

    <!-- 常用设置单元格组 -->
    <div class="menu-group">
      <van-cell-group inset title="教务设置">
        <van-cell
          title="同步教务学籍信息"
          value="刷新信息"
          is-link
          @click="onSyncStudentInfo"
          icon="replay"
        />
        <van-cell
          title="当前学期"
          :value="userStore.curTerm"
          is-link
          @click="showTermSheet = true"
          icon="calendar-o"
        />
        <van-cell
          title="当前教学周"
          :value="`第 ${userStore.curWeek} 周`"
          is-link
          @click="showWeekSheet = true"
          icon="underway-o"
        />
        <van-cell
          title="自习空教室查询"
          is-link
          to="/classroom"
          icon="hotel-o"
        />
      </van-cell-group>
    </div>

    <div class="menu-group">
      <van-cell-group inset title="系统设置">
        <van-cell title="离线/演示模式" icon="cluster-o">
          <template #right-icon>
            <van-switch
              :model-value="userStore.isMockMode"
              @update:model-value="toggleMock"
              size="20"
            />
          </template>
        </van-cell>
        <van-cell
          title="清理离线缓存"
          is-link
          @click="onClearCache"
          icon="delete-o"
        />
        <van-cell
          title="关于山科小站"
          is-link
          @click="showAboutDialog = true"
          icon="info-o"
        />
      </van-cell-group>
    </div>

    <div class="logout-box">
      <van-button
        round
        block
        type="danger"
        plain
        @click="onLogout"
        class="logout-btn"
      >
        退出当前登录
      </van-button>
    </div>

    <!-- 学期选择 -->
    <van-action-sheet
      v-model:show="showTermSheet"
      :actions="termOptions"
      cancel-text="取消"
      close-on-click-action
      @select="onSelectTerm"
    />

    <!-- 教学周选择 -->
    <van-popup v-model:show="showWeekSheet" round position="bottom">
      <div class="picker-header">
        <span class="picker-title">设置当前教学周</span>
        <van-button
          size="small"
          type="primary"
          round
          @click="showWeekSheet = false"
          >确定</van-button
        >
      </div>
      <div class="week-grid">
        <div
          v-for="w in 20"
          :key="w"
          class="week-chip"
          :class="{ 'chip-active': w === userStore.curWeek }"
          @click="onSelectWeek(w)"
        >
          第 {{ w }} 周
        </div>
      </div>
    </van-popup>

    <!-- 关于弹窗 -->
    <van-dialog
      v-model:show="showAboutDialog"
      title="关于山科小站 (Android)"
      confirm-button-text="了解"
    >
      <div class="about-content">
        <p>
          <strong>山科小站</strong> 是专为山东科技大学学生打造的移动教务助手。
        </p>
        <p>
          本项目基于开源生态 <code>WindrunnerMax/SHST</code>，采用 Vue 3 + Vant
          + Capacitor 原生跨端技术重构为 Android 原生体验应用。
        </p>
        <p><strong>特性：</strong></p>
        <ul>
          <li>内置图像字模二值化引擎，验证码全自动识别</li>
          <li>全链路原生 HTTPS / Cookie 会话保持</li>
          <li>课表、成绩离线缓存，断网秒开</li>
          <li>GPA / 加权均分实时动态换算</li>
          <li>自适应 Android 沉浸式状态栏与手势</li>
        </ul>
        <p class="copyright">山科小站 v1.0.12 (Android) · 山科大开源贡献</p>
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { showToast, showConfirmDialog } from "vant";
import { useUserStore } from "../stores/user";
import { useTimetableStore } from "../stores/timetable";
import { api } from "../services/api";

const router = useRouter();
const userStore = useUserStore();
const timetableStore = useTimetableStore();

const showTermSheet = ref(false);
const showWeekSheet = ref(false);
const showAboutDialog = ref(false);

const termOptions = [
  { name: "2026-2027-1 (当前)", value: "2026-2027-1" },
  { name: "2025-2026-2", value: "2025-2026-2" },
  { name: "2025-2026-1", value: "2025-2026-1" },
  { name: "2024-2025-2", value: "2024-2025-2" },
  { name: "2024-2025-1", value: "2024-2025-1" },
];

const onSyncStudentInfo = async () => {
  showToast({ type: "loading", message: "同步中...", forbidClick: true });
  try {
    const info = await api.getStudentInfo();
    if (info && (info.name || info.college)) {
      userStore.updateStudentInfo(info);
      showToast({ type: "success", message: "学籍信息已更新" });
    } else {
      showToast("未检测到新学籍，保持现有信息");
    }
  } catch (_) {
    showToast("同步学籍失败");
  }
};

const toggleMock = (val: boolean) => {
  userStore.setMockMode(val);
  timetableStore.fetchTimetable(userStore.curTerm);
  showToast({
    type: "success",
    message: val ? "已开启演示/离线模式" : "已关闭演示模式",
  });
};

const onSelectTerm = (action: any) => {
  userStore.setCurTerm(action.value);
  timetableStore.fetchTimetable(action.value);
  showToast("已切换至学期: " + action.value);
};

const onSelectWeek = (w: number) => {
  userStore.setCurWeek(w);
  timetableStore.selectedWeek = w;
  showWeekSheet.value = false;
  showToast(`当前周已设置为第 ${w} 周`);
};

const onClearCache = () => {
  showConfirmDialog({
    title: "清除缓存",
    message: "确定要清除本地缓存的课表和成绩数据吗？下次进入将重新拉取。",
  }).then(() => {
    localStorage.removeItem("shst_timetable");
    localStorage.removeItem("shst_grades");
    localStorage.removeItem("shst_exams");
    showToast({ type: "success", message: "本地缓存已清空" });
  });
};

const onLogout = () => {
  showConfirmDialog({
    title: "退出登录",
    message: "确定要退出当前账号吗？",
  }).then(async () => {
    try {
      await userStore.logout();
    } catch (_) {
      showToast("已退出，凭据清理未完成，请稍后重试");
    }
    router.replace("/login");
  });
};
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background-color: #f8fafc;
  padding-bottom: 80px;
}

.user-card {
  background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
  padding: 32px 20px 24px;
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 15px rgba(79, 70, 229, 0.2);
}

.avatar-box {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
}

.avatar-icon {
  font-size: 32px;
  color: #ffffff;
}

.user-meta {
  flex: 1;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.user-name {
  font-size: 19px;
  font-weight: 700;
}

.user-detail {
  font-size: 13px;
  opacity: 0.9;
  margin-bottom: 2px;
}

.user-id {
  font-size: 12px;
  opacity: 0.75;
}

.class-name {
  opacity: 0.85;
}

.menu-group {
  margin-top: 14px;
}

.logout-box {
  margin: 28px 16px;
}

.logout-btn {
  height: 44px;
  font-weight: 600;
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.picker-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 20px;
  max-height: 320px;
  overflow-y: auto;
}

.week-chip {
  padding: 10px 0;
  text-align: center;
  font-size: 13px;
  background: #f1f5f9;
  color: #475569;
  border-radius: 10px;
  cursor: pointer;
}

.chip-active {
  background: #4f46e5;
  color: #ffffff;
  font-weight: 700;
}

.about-content {
  padding: 16px 20px;
  font-size: 13px;
  line-height: 1.6;
  color: #475569;
}

.about-content ul {
  padding-left: 18px;
  margin: 8px 0;
}

.copyright {
  text-align: center;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 14px;
}
</style>
