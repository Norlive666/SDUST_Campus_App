<template>
  <main class="grade-page campus-page">
    <PageHeader
      eyebrow="学习记录"
      title="成绩"
      subtitle="每一份努力，都有迹可循"
      ><button
        class="icon-button"
        aria-label="刷新成绩"
        :disabled="loading"
        @click="onRefresh"
      >
        <van-loading v-if="loading" size="18" /><van-icon
          v-else
          name="replay"
        /></button
    ></PageHeader>
    <div class="filter-bar">
      <button class="term-button" @click="showTermPicker = true">
        <van-icon aria-hidden="true" name="calendar-o" /><span>{{ selectedTermLabel }}</span
        ><van-icon aria-hidden="true" name="arrow-down" /></button
      ><span class="record-count">{{ filteredGrades.length }} 门课程</span>
    </div>
    <SyncNotice
      class="load-error"
      :message="loadError"
      :needs-login="needsLogin"
    />
    <van-pull-refresh
      v-model="refreshing"
      @refresh="onRefresh"
      class="pull-refresh"
    >
      <section class="summary-card" aria-label="成绩概览">
        <div class="summary-label">
          <span><van-icon aria-hidden="true" name="bar-chart-o" /> 学习概览</span><span>GPA</span>
        </div>
        <div class="summary-top">
          <div class="gpa-box">
            <span class="gpa-label">平均学分绩点</span
            ><strong class="gpa-value">{{
              loading && !grades.length ? "—" : calculatedGpa
            }}</strong>
          </div>
          <div class="score-box">
            <strong class="score-value">{{ calculatedAvgScore }}</strong
            ><span class="score-label">加权平均分</span>
          </div>
        </div>
        <div class="summary-bottom">
          <div class="stat-item">
            <strong>{{ totalCredits }}</strong
            ><span>已获学分</span>
          </div>
          <div class="stat-item">
            <strong
              >{{ passedCount
              }}<small> / {{ gradedCount }}</small></strong
            ><span>通过课程</span>
          </div>
          <div class="stat-item">
            <strong
              :class="{ attention: failedCount > 0 }"
              >{{ failedCount }}</strong
            ><span>未通过课程</span>
          </div>
        </div>
        <p v-if="unsettledCount" class="footnote">{{ unsettledCount }} 门待出分、免修/免考或状态待核实，未计入通过率与绩点</p>
      </section>
      <div class="section-heading">
        <h2>课程成绩</h2>
        <span v-if="loading" class="state-loading"
          ><van-loading size="11" /> 同步中</span
        ><span v-else>共 {{ visibleGrades.length }} 条记录</span>
      </div>
      <label class="grade-search"
        ><van-icon aria-hidden="true" name="search" /><input
          v-model="query"
          type="search"
          aria-label="搜索课程"
          placeholder="搜索课程名称" /><button
          v-if="query"
          type="button"
          aria-label="清空搜索"
          @click="query = ''"
        >
          <van-icon aria-hidden="true" name="cross" /></button
      ></label>
      <div class="grade-segments" aria-label="成绩筛选">
        <button
          v-for="item in statusOptions"
          :key="item.value"
          :aria-pressed="statusFilter === item.value"
          :class="{ selected: statusFilter === item.value }"
          @click="statusFilter = item.value"
        >
          {{ item.label }}
        </button>
      </div>
      <div v-if="visibleGrades.length" class="grades-list">
        <article
          v-for="(g, idx) in visibleGrades"
          :key="g.code + g.term + idx"
          class="grade-item-card"
        >
          <div class="grade-card-left">
            <div class="course-name">
              {{ g.name }}
              <span
                v-if="g.examNature && !['正常考试', '初修'].includes(g.examNature)"
                class="nature-tag"
                :class="getNatureClass(g.examNature)"
              >{{ g.examNature }}</span>
            </div>
            <div class="course-meta">
              <span class="meta-tag">{{ g.type || "必修" }}</span
              ><span>{{ g.credit }} 学分</span
              ><span v-if="['pass', 'fail'].includes(gradeStatus(g))">绩点 {{ g.gpa }}</span>
            </div>
            <div class="course-term">
              {{ g.term }}<span v-if="g.examType"> · {{ g.examType }}</span>
              <span v-if="g.remark && g.remark !== g.examNature"> · {{ g.remark }}</span>
            </div>
          </div>
          <div class="grade-card-right">
            <strong
              class="score-display"
              :class="{
                'score-fail': gradeStatus(g) === 'fail',
                'score-pending': !['pass', 'fail'].includes(gradeStatus(g)),
                'score-word': g.score.length > 3,
              }"
              >{{ g.score }}</strong
            ><span
              class="score-status"
              :class="gradeStatus(g) === 'pass' ? 'status-pass' : gradeStatus(g) === 'fail' ? 'status-fail' : 'status-pending'"
              ><i></i>{{ gradeStatusLabel(g) }}</span
            >
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        <span class="empty-icon"
          ><van-icon aria-hidden="true" :name="loading ? 'search' : 'notes-o'"
        /></span>
        <h3>
          {{
            loading
              ? "正在查询成绩"
              : query || statusFilter !== "all"
                ? "没有匹配的课程"
                : loadError
                  ? "成绩暂未同步"
                  : "暂无成绩记录"
          }}
        </h3>
        <p>
          {{
            query || statusFilter !== "all"
              ? "试试其他课程名称或筛选条件"
              : loadError
                ? "已有缓存会继续保留，可以稍后重试"
                : "已公布的课程成绩将在这里显示"
          }}
        </p>
        <button v-if="loadError && !loading" @click="onRefresh">
          重新查询
        </button>
      </div>
      <p class="footnote">成绩以教务系统为准 · 无官方绩点时按现有公式估算；重复考试记录逐条展示</p>
    </van-pull-refresh>
    <van-action-sheet
      v-model:show="showTermPicker"
      title="选择成绩学期"
      :actions="termOptions"
      cancel-text="取消"
      close-on-click-action
      @select="onSelectTerm"
    />
  </main>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { showToast } from "vant";
import { SessionExpiredError } from "../services/response";
import { readGradeCache, saveGradeCache } from "../services/grade-cache";
import { api } from "../services/api";
import { GradeItem } from "../services/parser";
import { gradeStatus, gradeStatusLabel, isSpecialGrade, numericScore } from "../services/grade-result";
import PageHeader from "../components/PageHeader.vue";
import SyncNotice from "../components/SyncNotice.vue";
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
const statusOptions = [
  { label: "全部", value: "all" as const },
  { label: "已通过", value: "pass" as const },
  { label: "未通过", value: "fail" as const },
  { label: "补/缓考", value: "special" as const },
  { label: "待出分", value: "pending" as const },
];
const query = ref("");
const statusFilter = ref<"all" | "pass" | "fail" | "special" | "pending">("all");
const visibleGrades = computed(() =>
  filteredGrades.value.filter((g) => {
    const matchesQuery = g.name.toLowerCase().includes(query.value.trim().toLowerCase());
    if (!matchesQuery) return false;

    if (statusFilter.value === "all") return true;
    if (statusFilter.value === "pass") return gradeStatus(g) === "pass";
    if (statusFilter.value === "fail") return gradeStatus(g) === "fail";
    if (statusFilter.value === "pending") return gradeStatus(g) === "pending";
    if (statusFilter.value === "special") {
      return isSpecialGrade(g);
    }
    return true;
  }),
);

const getNatureClass = (nature?: string) => {
  if (!nature) return "";
  if (nature.includes("缓考")) return "tag-deferred";
  if (nature.includes("补考")) return "tag-makeup";
  if (nature.includes("重修")) return "tag-retake";
  return "tag-other";
};

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

const graded = computed(() => filteredGrades.value.filter(g => ["pass", "fail"].includes(gradeStatus(g))));
const gradedCount = computed(() => graded.value.length);
const unsettledCount = computed(() => filteredGrades.value.length - gradedCount.value);
const passedCount = computed(() => filteredGrades.value.filter(g => gradeStatus(g) === "pass").length);
const failedCount = computed(() => filteredGrades.value.filter(g => gradeStatus(g) === "fail").length);
const totalCredits = computed(() => filteredGrades.value.reduce((sum, g) => sum + (gradeStatus(g) === "pass" ? g.credit : 0), 0).toFixed(1));
const calculatedGpa = computed(() => {
  const credits = graded.value.reduce((sum, g) => sum + g.credit, 0);
  return credits > 0 ? (graded.value.reduce((sum, g) => sum + g.gpa * g.credit, 0) / credits).toFixed(2) : "—";
});
const calculatedAvgScore = computed(() => {
  const numeric = graded.value.filter(g => numericScore(g.score) !== null);
  const credits = numeric.reduce((sum, g) => sum + g.credit, 0);
  return credits > 0 ? (numeric.reduce((sum, g) => sum + numericScore(g.score)! * g.credit, 0) / credits).toFixed(1) : "—";
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
.record-count {
  font-size: 11px;
  color: #949bad;
  white-space: nowrap;
}
.summary-card {
  border: 1px solid #e1daf6;
  background: linear-gradient(120deg, #ede8fc, #f3f0fc 85%);
  padding: 20px;
  border-radius: 22px;
  position: relative;
  overflow: hidden;
}
.summary-card::after {
  content: "";
  position: absolute;
  width: 150px;
  height: 150px;
  border: 1px solid #e3dcf5;
  border-radius: 50%;
  top: -70px;
  right: -45px;
  pointer-events: none;
}
.summary-label {
  display: flex;
  justify-content: space-between;
  color: #a094c4;
  font-size: 10px;
  letter-spacing: 1px;
}
.summary-label .van-icon {
  margin-right: 4px;
  font-size: 13px;
}
.summary-label > span:last-child {
  letter-spacing: 2px;
}
.summary-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-top: 25px;
  padding-bottom: 21px;
}
.gpa-label {
  font-size: 11px;
  color: #8f81b0;
  display: block;
  margin-bottom: 7px;
}
.gpa-value {
  font-size: 48px;
  font-weight: 650;
  line-height: 1.15;
  color: #65529e;
  letter-spacing: -2px;
  font-variant-numeric: tabular-nums;
}
.score-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  padding-bottom: 4px;
}
.score-value {
  font-size: 25px;
  font-weight: 650;
  color: #7b6a9e;
}
.score-label {
  font-size: 10px;
  color: #9c8eb4;
}
.summary-bottom {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-top: 17px;
  border-top: 1px solid #e1daf1;
}
.stat-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 17px;
  border-left: 1px solid #e1daf1;
}
.stat-item:first-child {
  padding-left: 0;
  border: 0;
}
.stat-item strong {
  color: #706087;
  font-size: 17px;
  font-weight: 650;
}
.stat-item small {
  font-weight: 400;
  font-size: 11px;
  color: #a396b4;
}
.stat-item > span {
  font-size: 9px;
  color: #a194b1;
}
.stat-item .attention {
  color: #c38b64;
}
.grade-search {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid #e6e8f0;
  background: white;
  border-radius: 12px;
  padding: 0 12px;
  height: 43px;
  color: #a2a7b8;
}
.grade-search input {
  flex: 1;
  width: 100%;
  min-width: 0;
  border: 0;
  background: none;
  outline: 0;
  font-size: 12px;
  color: #656b80;
}
.grade-search input::placeholder {
  color: #b0b4c3;
}
.grade-search button {
  background: none;
  border: 0;
  color: #a2a7b8;
  padding: 10px 0;
}
.grade-segments {
  display: flex;
  gap: 7px;
  padding: 13px 0 17px;
}
.grade-segments button {
  border: 1px solid transparent;
  background: none;
  color: #9298ac;
  border-radius: 9px;
  padding: 7px 13px;
  min-height: 34px;
  font-size: 11px;
}
.grade-segments .selected {
  color: #8773be;
  background: #eae5f8;
  border-color: #e1d9f3;
  font-weight: 600;
}
.grades-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.grade-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 17px 16px;
  border-radius: 17px;
  border: 1px solid #e9eaf2;
  background: white;
}
.grade-card-left {
  flex: 1;
  min-width: 0;
}
.course-name {
  color: #464b62;
  font-size: 15px;
  line-height: 1.55;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.course-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: #7d8498;
  margin-top: 9px;
}
.meta-tag {
  padding: 3px 6px;
  border-radius: 5px;
  background: #f4f1fa;
  color: #a394b9;
  font-size: 9px;
}
.course-term {
  font-size: 10px;
  color: #8990a4;
  margin-top: 9px;
}
.grade-card-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
  max-width: 90px;
}
.score-display {
  font-size: 27px;
  line-height: 1.1;
  font-weight: 650;
  letter-spacing: -0.8px;
  color: #8976bb;
}
.score-word {
  font-size: 18px;
  overflow-wrap: anywhere;
}
.score-fail {
  color: #cc8588;
}
.score-pending {
  color: #d97706;
}
.score-status {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 10px;
}
.score-status i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}
.status-pass {
  color: #6a8976;
}
.status-fail {
  color: #cc8588;
}
.status-pending {
  color: #d97706;
}
.nature-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
  vertical-align: middle;
}
.tag-deferred {
  background: #fef3e2;
  color: #d97706;
  border: 1px solid #fde68a;
}
.tag-makeup {
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}
.tag-retake {
  background: #fdf2f8;
  color: #db2777;
  border: 1px solid #fbcfe8;
}
.tag-other {
  background: #f3f4f6;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}
@media (min-width: 700px) {
  .grades-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .summary-card {
    padding: 25px 30px;
  }
  .gpa-value {
    font-size: 58px;
  }
}
</style>
