<template>
  <div class="exam-page">
    <header class="page-header">
      <h2 class="title">考试日程</h2>
      <van-button size="small" round icon="replay" @click="loadExams" class="refresh-btn">
        刷新
      </van-button>
    </header>

    <div v-if="nearestExam" class="nearest-banner">
      <div class="banner-badge">最近一场</div>
      <div class="banner-title">{{ nearestExam.name }}</div>
      <div class="banner-info">
        <span>{{ nearestExam.time }}</span>
        <span>•</span>
        <span>{{ nearestExam.location }}</span>
      </div>
      <div class="banner-countdown" v-if="nearestExam.daysLeft !== undefined">
        距离考试还有 <strong class="highlight-days">{{ nearestExam.daysLeft > 0 ? nearestExam.daysLeft : 0 }}</strong> 天
      </div>
    </div>

    <div class="exam-list" v-if="exams.length > 0">
      <div v-for="(exam, idx) in exams" :key="idx" class="exam-card">
        <div class="exam-card-header">
          <span class="exam-name">{{ exam.name }}</span>
          <span v-if="exam.daysLeft !== undefined" class="countdown-tag" :class="{ 'tag-urgent': exam.daysLeft <= 3 }">
            {{ exam.daysLeft > 0 ? `${exam.daysLeft} 天后` : '已结束/进行中' }}
          </span>
        </div>

        <div class="exam-details">
          <div class="detail-row">
            <van-icon name="clock-o" class="row-icon" />
            <span class="row-label">时间：</span>
            <span class="row-val">{{ exam.time }}</span>
          </div>

          <div class="detail-row">
            <van-icon name="location-o" class="row-icon" />
            <span class="row-label">考场：</span>
            <span class="row-val font-semibold">{{ exam.location }}</span>
          </div>

          <div class="detail-row">
            <van-icon name="idcard" class="row-icon" />
            <span class="row-label">座位：</span>
            <span class="row-val font-semibold seat-num">{{ exam.seat }} 号</span>
          </div>
        </div>
      </div>
    </div>

    <van-empty v-else description="暂无考试安排" image="passed" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { showToast } from 'vant';
import { api } from '../services/api';
import { ExamItem } from '../services/parser';
import { useUserStore } from '../stores/user';

const userStore = useUserStore();
const exams = ref<ExamItem[]>([]);

const nearestExam = computed(() => {
  if (exams.value.length === 0) return null;
  const valid = exams.value.filter((e) => e.daysLeft !== undefined && e.daysLeft >= 0);
  return valid.length > 0 ? valid[0] : exams.value[0];
});

const loadExams = async () => {
  try {
    const data = await api.getExams(userStore.curTerm);
    exams.value = data;
    try {
      localStorage.setItem('shst_exams', JSON.stringify(data));
    } catch (_) {}
    showToast({ type: 'success', message: '考试安排已更新' });
  } catch (e) {
    showToast('获取考试失败');
  }
};

onMounted(() => {
  userStore.init();
  try {
    const cached = localStorage.getItem('shst_exams');
    if (cached) {
      exams.value = JSON.parse(cached);
    }
  } catch (_) {}

  if (exams.value.length === 0) {
    loadExams();
  }
});
</script>

<style scoped>
.exam-page {
  min-height: 100vh;
  background-color: #f8fafc;
  padding: 16px 16px 80px;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.refresh-btn {
  border-color: #cbd5e1;
  color: #475569;
}

.nearest-banner {
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
  border-radius: 20px;
  padding: 18px;
  color: #ffffff;
  box-shadow: 0 10px 20px rgba(245, 158, 11, 0.25);
  margin-bottom: 20px;
  position: relative;
  overflow: hidden;
}

.banner-badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.25);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 8px;
}

.banner-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 6px;
}

.banner-info {
  display: flex;
  gap: 6px;
  font-size: 12px;
  opacity: 0.9;
  margin-bottom: 10px;
}

.banner-countdown {
  font-size: 14px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.15);
  display: inline-block;
  padding: 4px 10px;
  border-radius: 8px;
}

.highlight-days {
  font-size: 20px;
  font-weight: 800;
  color: #fef08a;
}

.exam-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exam-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.exam-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 10px;
  margin-bottom: 12px;
}

.exam-name {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.countdown-tag {
  font-size: 12px;
  color: #4f46e5;
  background: #eef2ff;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 600;
}

.tag-urgent {
  color: #ef4444;
  background: #fee2e2;
}

.exam-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  font-size: 13px;
}

.row-icon {
  font-size: 15px;
  color: #6366f1;
  margin-right: 8px;
}

.row-label {
  color: #64748b;
  width: 44px;
}

.row-val {
  color: #334155;
}

.font-semibold {
  font-weight: 600;
}

.seat-num {
  color: #e11d48;
}
</style>
