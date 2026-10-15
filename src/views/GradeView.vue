<template>
  <div class="grade-page">
    <header class="page-header">
      <h2 class="title">成绩与绩点</h2>
      <van-button
        size="small"
        round
        icon="filter-o"
        @click="showTermPicker = true"
        class="term-filter-btn"
      >
        {{ selectedTermLabel }}
      </van-button>
    </header>

    <div v-if="loadError" class="load-error" role="status">
      <span>{{ loadError }}</span
      ><router-link v-if="needsLogin" to="/login?reauth=1"
        >重新验证</router-link
      >
    </div>
    <van-pull-refresh
      v-model="refreshing"
      @refresh="onRefresh"
      class="pull-refresh"
    >
      <!-- 绩点概览卡片 -->
      <div class="summary-card">
        <div class="summary-top">
          <div class="gpa-box">
            <span class="gpa-label">平均学分绩点 (GPA)</span>
            <span class="gpa-value">{{ calculatedGpa }}</span>
          </div>
          <div class="score-box">
            <span class="score-label">加权均分</span>
            <span class="score-value">{{ calculatedAvgScore }}</span>
          </div>
        </div>

        <div class="summary-bottom">
          <div class="stat-item">
            <span class="stat-num">{{ totalCredits }}</span>
            <span class="stat-desc">总获得学分</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-num">{{ filteredGrades.length }}</span>
            <span class="stat-desc">修读门数</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-num text-green">{{ passedCount }}</span>
            <span class="stat-desc">通过门数</span>
          </div>
        </div>
      </div>

      <!-- 成绩列表 -->
      <div class="grades-list" v-if="filteredGrades.length > 0">
        <div
          v-for="(g, idx) in filteredGrades"
          :key="idx"
          class="grade-item-card"
        >
          <div class="grade-card-left">
            <div class="course-name">{{ g.name }}</div>
            <div class="course-meta">
              <van-tag type="primary" plain class="meta-tag">{{
                g.type || "必修"
              }}</van-tag>
              <span class="meta-text">{{ g.credit }} 学分</span>
              <span class="meta-text">绩点: {{ g.gpa }}</span>
            </div>
            <div class="course-term">{{ g.term }}</div>
          </div>

          <div class="grade-card-right">
            <div class="score-display" :class="{ 'score-fail': !g.isPass }">
              {{ g.score }}
            </div>
            <div
              class="score-status"
              :class="g.isPass ? 'status-pass' : 'status-fail'"
            >
              {{ g.isPass ? "已通过" : "未通过" }}
            </div>
          </div>
        </div>
      </div>

      <van-empty
        v-else
        :description="
          loading
            ? '正在查询成绩…'
            : loadError
              ? '成绩暂未同步，请稍后重试'
              : '暂无成绩记录'
        "
        image="search"
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
import { ref, computed, onMounted } from "vue";
import { showToast } from "vant";
import { SessionExpiredError } from "../services/response";
import { readGradeCache, saveGradeCache } from "../services/grade-cache";
import { api } from "../services/api";
import { GradeItem } from "../services/parser";
import { useUserStore } from "../stores/user";

const userStore = useUserStore();

const grades = ref<GradeItem[]>([]);
const refreshing = ref(false);
const showTermPicker = ref(false);
const selectedTerm = ref("all");
const loadError = ref("");
const loading = ref(false);
const needsLogin = ref(false);
let requestId = 0;

const termOptions = computed(() => {
  const current = userStore.curTerm;
  const year = parseInt(current.split("-")[0], 10) || new Date().getFullYear();
  const terms = new Set([current, ...grades.value.map((g) => g.term)]);
  for (let y = year; y >= year - 5; y--) {
    terms.add(`${y}-${y + 1}-1`);
    terms.add(`${y}-${y + 1}-2`);
  }
  return [
    { name: "全部学期", value: "all" },
    ...Array.from(terms)
      .filter(Boolean)
      .sort()
      .reverse()
      .map((value) => ({
        name: value + (value === current ? " (当前)" : ""),
        value,
      })),
  ];
});

const selectedTermLabel = computed(() => {
  const found = termOptions.value.find((t) => t.value === selectedTerm.value);
  return found ? found.name : "全部学期";
});

const filteredGrades = computed(() => {
  if (selectedTerm.value === "all") return grades.value;
  return grades.value.filter(
    (g) => !g.term || g.term === selectedTerm.value || g.term === "当前学期",
  );
});

const totalCredits = computed(() => {
  const sum = filteredGrades.value.reduce(
    (acc, cur) => acc + (cur.isPass ? cur.credit : 0),
    0,
  );
  return sum.toFixed(1);
});

const passedCount = computed(() => {
  return filteredGrades.value.filter((g) => g.isPass).length;
});

const calculatedGpa = computed(() => {
  let totalPoints = 0;
  let totalCredit = 0;
  for (const g of filteredGrades.value) {
    totalPoints += g.gpa * g.credit;
    totalCredit += g.credit;
  }
  return totalCredit > 0 ? (totalPoints / totalCredit).toFixed(2) : "0.00";
});

const calculatedAvgScore = computed(() => {
  let totalWeightedScore = 0;
  let totalCredit = 0;
  for (const g of filteredGrades.value) {
    const scoreNum = parseFloat(g.score);
    if (!isNaN(scoreNum)) {
      totalWeightedScore += scoreNum * g.credit;
      totalCredit += g.credit;
    }
  }
  return totalCredit > 0 ? (totalWeightedScore / totalCredit).toFixed(1) : "-";
});

const loadGrades = async (): Promise<boolean> => {
  const id = ++requestId;
  const term = selectedTerm.value;
  loadError.value = "";
  needsLogin.value = false;
  loading.value = true;
  try {
    const data = await api.getGrades(term === "all" ? "" : term);
    // 归一化学期标识，防止由于教务未回传学期字段导致前端筛选为空
    const normalizedData = data.map((item) => ({
      ...item,
      term:
        item.term && item.term !== "当前学期"
          ? item.term
          : term === "all"
            ? item.term || userStore.curTerm || "当前学期"
            : term,
    }));
    saveGradeCache(term, normalizedData);
    if (id !== requestId) return false;
    grades.value = normalizedData;
    return true;
  } catch (error) {
    if (id === requestId) {
      needsLogin.value = error instanceof SessionExpiredError;
      loadError.value =
        error instanceof Error ? error.message : "获取成绩失败，已保留缓存";
      showToast(loadError.value);
    }
    return false;
  } finally {
    if (id === requestId) loading.value = false;
  }
};

const onSelectTerm = (action: { value: string }) => {
  selectedTerm.value = action.value;
  grades.value = readGradeCache(action.value);
  loadGrades();
};

const onRefresh = async () => {
  try {
    if (await loadGrades())
      showToast({ type: "success", message: "成绩已刷新" });
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => {
  userStore.init();
  grades.value = readGradeCache(selectedTerm.value);
  // Render cached grades immediately, then update in the background.
  loadGrades();
});
</script>

<style scoped>
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
.grade-page {
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

.term-filter-btn {
  border-color: #cbd5e1;
  color: #475569;
}

.summary-card {
  background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
  border-radius: 20px;
  padding: 20px;
  color: #ffffff;
  box-shadow: 0 10px 25px rgba(79, 70, 229, 0.25);
  margin-bottom: 20px;
}

.summary-top {
  display: flex;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.gpa-label,
.score-label {
  display: block;
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 4px;
}

.gpa-value {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
}

.score-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
}

.summary-bottom {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-top: 14px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 16px;
  font-weight: 700;
}

.stat-desc {
  font-size: 11px;
  opacity: 0.8;
  margin-top: 2px;
}

.stat-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
}

.grades-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grade-item-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.grade-card-left {
  flex: 1;
  padding-right: 12px;
}

.course-name {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 6px;
}

.course-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.meta-tag {
  font-size: 10px;
}

.meta-text {
  font-size: 12px;
  color: #64748b;
}

.course-term {
  font-size: 11px;
  color: #94a3b8;
}

.grade-card-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 60px;
}

.score-display {
  font-size: 22px;
  font-weight: 800;
  color: #4f46e5;
  line-height: 1.2;
}

.score-fail {
  color: #ef4444;
}

.score-status {
  font-size: 11px;
  margin-top: 2px;
}

.status-pass {
  color: #10b981;
}

.status-fail {
  color: #ef4444;
}

.text-green {
  color: #a7f3d0;
}
</style>
