<template>
  <div class="exam-page">
    <header class="page-header">
      <h2 class="title">考试日程</h2>
      <div class="header-actions">
        <van-button
          size="small"
          round
          icon="filter-o"
          @click="showTermPicker = true"
          class="term-filter-btn"
        >
          {{ selectedTermLabel }}
        </van-button>
        <van-button
          size="small"
          round
          icon="replay"
          :loading="loading"
          @click="onRefresh"
          class="refresh-btn"
        >
          刷新
        </van-button>
      </div>
    </header>

    <div v-if="loadError" class="load-error" role="status">
      <span>{{ loadError }}</span>
      <router-link v-if="needsLogin" to="/login?reauth=1">重新验证</router-link>
    </div>

    <van-pull-refresh
      v-model="refreshing"
      @refresh="onRefresh"
      class="pull-refresh"
    >
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

      <van-empty
        v-else
        :description="loading ? '正在查询考试安排…' : (loadError ? '考试暂未同步，请稍后重试' : '暂无考试安排')"
        :image="loading ? 'search' : 'passed'"
      />
    </van-pull-refresh>

    <!-- 学期选择弹窗 -->
    <van-action-sheet
      v-model:show="showTermPicker"
      :actions="termOptions"
      cancel-text="取消"
      close-on-click-action
      @select="onSelectTerm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { showToast } from 'vant';
import { SessionExpiredError } from '../services/response';
import { readExamCache, saveExamCache } from '../services/exam-cache';
import { api } from '../services/api';
import { ExamItem } from '../services/parser';
import { useUserStore } from '../stores/user';

const userStore = useUserStore();
const exams = ref<ExamItem[]>([]);
const refreshing = ref(false);
const loading = ref(false);
const showTermPicker = ref(false);
const selectedTerm = ref('');
const loadError = ref('');
const needsLogin = ref(false);
let requestId = 0;

const termOptions = computed(() => {
  const current = userStore.curTerm || '2026-2027-1';
  const year = parseInt(current.split('-')[0], 10) || new Date().getFullYear();
  const terms = new Set([current]);
  for (let y = year; y >= year - 5; y--) {
    terms.add(`${y}-${y + 1}-1`);
    terms.add(`${y}-${y + 1}-2`);
  }
  return [
    { name: '全部学期', value: 'all' },
    ...Array.from(terms)
      .filter(Boolean)
      .sort()
      .reverse()
      .map((value) => ({
        name: value + (value === current ? ' (当前)' : ''),
        value,
      })),
  ];
});

const selectedTermLabel = computed(() => {
  const found = termOptions.value.find((t) => t.value === selectedTerm.value);
  return found ? found.name : '学期选择';
});

const nearestExam = computed(() => {
  if (exams.value.length === 0) return null;
  const valid = exams.value.filter((e) => e.daysLeft !== undefined && e.daysLeft >= 0);
  return valid.length > 0 ? valid[0] : exams.value[0];
});

const loadExams = async (): Promise<boolean> => {
  const id = ++requestId;
  const term = selectedTerm.value;
  loadError.value = '';
  needsLogin.value = false;
  loading.value = true;

  try {
    const data = await api.getExams(term === 'all' ? '' : term);
    saveExamCache(term, data);
    if (id !== requestId) return false;
    exams.value = data;
    return true;
  } catch (error) {
    if (id === requestId) {
      needsLogin.value = error instanceof SessionExpiredError;
      loadError.value = error instanceof Error ? error.message : '获取考试安排失败，已保留缓存';
      showToast(loadError.value);
    }
    return false;
  } finally {
    if (id === requestId) loading.value = false;
  }
};

const onSelectTerm = (action: { value: string }) => {
  selectedTerm.value = action.value;
  exams.value = readExamCache(action.value);
  loadExams();
};

const onRefresh = async () => {
  try {
    if (await loadExams()) {
      showToast({ type: 'success', message: '考试安排已更新' });
    }
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => {
  userStore.init();
  selectedTerm.value = userStore.curTerm || 'all';
  exams.value = readExamCache(selectedTerm.value);
  loadExams();
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.term-filter-btn {
  border-color: #e2e8f0;
  color: #334155;
  font-weight: 600;
  background-color: #ffffff;
}

.refresh-btn {
  border-color: #cbd5e1;
  color: #475569;
}

.load-error {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 12px;
  background: #fff4e6;
  color: #975b16;
  font-size: 12px;
  line-height: 1.6;
}

.load-error span {
  flex: 1;
}

.load-error a {
  flex-shrink: 0;
  color: #6151c8;
  font-weight: 600;
}

.pull-refresh {
  min-height: calc(100vh - 120px);
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
