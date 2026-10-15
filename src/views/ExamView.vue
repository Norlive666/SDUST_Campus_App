<template>
  <main class="exam-page campus-page">
    <PageHeader eyebrow="考试安排" title="考试" subtitle="提前准备，安心赴考"
      ><button
        class="icon-button"
        aria-label="刷新考试"
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
        <van-icon aria-hidden="true" name="calendar-o" /><span>{{
          selectedTermLabel
        }}</span
        ><van-icon aria-hidden="true" name="arrow-down" /></button
      ><span class="exam-total">{{ upcomingExams.length }} 场待考</span>
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
      <section v-if="nearestExam" class="nearest-banner">
        <div class="banner-top">
          <span
            ><van-icon aria-hidden="true" name="underway-o" /> 下一场考试</span
          ><span class="banner-badge">{{
            nearestExam.daysLeft === 0 ? "今天见" : "做好准备"
          }}</span>
        </div>
        <div class="next-exam-main">
          <div class="next-course">
            <h2>{{ nearestExam.name }}</h2>
            <p>{{ nearestExam.time || "考试时间待确认" }}</p>
          </div>
          <div class="exam-countdown">
            <strong>{{ nearestExam.daysLeft }}</strong
            ><span>{{
              nearestExam.daysLeft === 0 ? "就是今天" : "天后开考"
            }}</span>
          </div>
        </div>
        <div class="next-exam-place">
          <span
            ><van-icon aria-hidden="true" name="location-o" />
            {{ nearestExam.location || "考场待确认" }}</span
          ><span v-if="nearestExam.seat">座位 {{ nearestExam.seat }} 号</span>
        </div>
      </section>
      <section
        v-else-if="
          !loading && !loadError && exams.length && !upcomingExams.length
        "
        class="all-done"
      >
        <span class="done-icon"
          ><van-icon aria-hidden="true" name="passed"
        /></span>
        <div>
          <h2>考试告一段落</h2>
          <p>当前查询范围内暂无待考安排</p>
        </div>
      </section>
      <div class="section-heading">
        <h2>考试日程</h2>
        <span v-if="loading" class="state-loading"
          ><van-loading size="11" /> 同步中</span
        ><span v-else>{{ visibleExams.length }} 场安排</span>
      </div>
      <div class="exam-segments" aria-label="考试筛选">
        <button
          v-for="item in examFilters"
          :key="item.value"
          :aria-pressed="examFilter === item.value"
          :class="{ selected: examFilter === item.value }"
          @click="examFilter = item.value"
        >
          {{ item.label }}
        </button>
      </div>
      <div v-if="visibleExams.length" class="exam-list">
        <article
          v-for="(exam, index) in visibleExams"
          :key="exam.name + exam.time + index"
          class="exam-card"
          :class="{ past: exam.daysLeft !== undefined && exam.daysLeft < 0 }"
        >
          <div class="exam-card-header">
            <span class="exam-symbol"
              ><van-icon aria-hidden="true" name="notes-o" /></span
            ><span
              class="exam-status"
              :class="{
                urgent:
                  exam.daysLeft !== undefined &&
                  exam.daysLeft >= 0 &&
                  exam.daysLeft <= 3,
              }"
              >{{ statusText(exam) }}</span
            >
          </div>
          <h3 class="exam-name">{{ exam.name }}</h3>
          <div class="exam-time">
            <van-icon aria-hidden="true" name="clock-o" /><span>{{
              exam.time || "时间待确认"
            }}</span>
          </div>
          <div class="exam-card-bottom">
            <div class="exam-location">
              <span>考试地点</span
              ><strong>{{ exam.location || "考场待确认" }}</strong>
            </div>
            <div class="exam-seat">
              <span>座位号</span
              ><strong
                >{{ exam.seat || "—"
                }}<small v-if="exam.seat">号</small></strong
              >
            </div>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        <span class="empty-icon"
          ><van-icon
            aria-hidden="true"
            :name="loading ? 'search' : 'calendar-o'"
        /></span>
        <h3>
          {{
            loading
              ? "正在查询考试"
              : loadError
                ? "考试暂未同步"
                : "暂无考试安排"
          }}
        </h3>
        <p>
          {{
            loadError
              ? "请检查校园网连接，已有缓存会继续保留"
              : examFilter !== "all"
                ? "当前筛选范围内没有相关考试"
                : "发布后的考试信息将在这里显示"
          }}
        </p>
        <button v-if="loadError && !loading" @click="onRefresh">
          重新查询
        </button>
      </div>
      <p class="footnote">考试安排以教务系统最新通知为准</p>
    </van-pull-refresh>
    <van-action-sheet
      v-model:show="showTermPicker"
      title="选择考试学期"
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
import { readExamCache, saveExamCache } from "../services/exam-cache";
import { api } from "../services/api";
import { ExamItem } from "../services/parser";
import PageHeader from "../components/PageHeader.vue";
import SyncNotice from "../components/SyncNotice.vue";
import { useUserStore } from "../stores/user";

const userStore = useUserStore();
const exams = ref<ExamItem[]>([]);
const refreshing = ref(false);
const loading = ref(false);
const showTermPicker = ref(false);
const selectedTerm = ref("");
const loadError = ref("");
const needsLogin = ref(false);
let requestId = 0;

const termOptions = computed(() => {
  const current = userStore.curTerm || "2026-2027-1";
  const year = parseInt(current.split("-")[0], 10) || new Date().getFullYear();
  const terms = new Set([current]);
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
  return found ? found.name : "学期选择";
});

const examFilter = ref<"all" | "upcoming" | "past">("all");
const examFilters = [
  { label: "全部安排", value: "all" as const },
  { label: "待考", value: "upcoming" as const },
  { label: "已结束", value: "past" as const },
];
const upcomingExams = computed(() =>
  exams.value
    .filter((e) => e.daysLeft === undefined || e.daysLeft >= 0)
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity)),
);
const nearestExam = computed(
  () => upcomingExams.value.find((e) => e.daysLeft !== undefined) || null,
);
const visibleExams = computed(() =>
  exams.value.filter(
    (e) =>
      examFilter.value === "all" ||
      (examFilter.value === "upcoming"
        ? e.daysLeft === undefined || e.daysLeft >= 0
        : e.daysLeft !== undefined && e.daysLeft < 0),
  ),
);
const statusText = (exam: ExamItem) =>
  exam.daysLeft === undefined
    ? "时间待确认"
    : exam.daysLeft < 0
      ? "已结束"
      : exam.daysLeft === 0
        ? "今日考试"
        : `${exam.daysLeft} 天后`;
const loadExams = async (): Promise<boolean> => {
  const id = ++requestId;
  const term = selectedTerm.value;
  loadError.value = "";
  needsLogin.value = false;
  loading.value = true;

  try {
    const data = await api.getExams(term === "all" ? "" : term);
    saveExamCache(term, data);
    if (id !== requestId) return false;
    exams.value = data;
    return true;
  } catch (error) {
    if (id === requestId) {
      needsLogin.value = error instanceof SessionExpiredError;
      loadError.value =
        error instanceof Error ? error.message : "获取考试安排失败，已保留缓存";
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
      showToast({ type: "success", message: "考试安排已更新" });
    }
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => {
  userStore.init();
  selectedTerm.value = userStore.curTerm || "all";
  exams.value = readExamCache(selectedTerm.value);
  loadExams();
});
</script>

<style scoped>
.exam-total {
  color: #a59ab7;
  font-size: 11px;
  white-space: nowrap;
}
.nearest-banner {
  padding: 20px;
  border: 1px solid #e6ddf0;
  border-radius: 22px;
  background: linear-gradient(120deg, #eee8f8, #f7f0f6);
}
.banner-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 10px;
  color: #a293b7;
}
.banner-top .van-icon {
  margin-right: 4px;
  font-size: 13px;
}
.banner-badge {
  border: 1px solid #e0d5ec;
  border-radius: 6px;
  padding: 4px 7px;
  font-size: 9px;
}
.next-exam-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin: 23px 0;
}
.next-course {
  flex: 1;
  min-width: 0;
}
.next-course h2 {
  font-size: 19px;
  line-height: 1.6;
  color: #726082;
  margin: 0 0 9px;
}
.next-course p {
  color: #897797;
  font-size: 10px;
  line-height: 1.7;
  margin: 0;
}
.exam-countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 65px;
  flex-shrink: 0;
}
.exam-countdown strong {
  font-size: 46px;
  color: #9678b7;
  line-height: 1;
  font-weight: 600;
  letter-spacing: -2px;
}
.exam-countdown span {
  font-size: 9px;
  color: #ac99bd;
}
.next-exam-place {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 15px;
  padding-top: 14px;
  border-top: 1px solid #e2d9ec;
  font-size: 10px;
  color: #897299;
  line-height: 1.7;
}
.next-exam-place > span:last-child {
  flex-shrink: 0;
}
.all-done {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 24px 20px;
  background: #edf3f0;
  border: 1px solid #dce7df;
  border-radius: 21px;
}
.done-icon {
  font-size: 29px;
  color: #8ca997;
}
.all-done h2 {
  margin: 0 0 8px;
  color: #768e7c;
  font-size: 16px;
}
.all-done p {
  margin: 0;
  color: #9cad9f;
  font-size: 11px;
}
.exam-segments {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}
.exam-segments button {
  padding: 8px 13px;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: none;
  font-size: 11px;
  color: #999cb0;
}
.exam-segments .selected {
  color: #8773be;
  background: #eae5f8;
  border-color: #e1d9f3;
  font-weight: 600;
}
.exam-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.exam-card {
  padding: 18px;
  border: 1px solid #e9eaf2;
  background: white;
  border-radius: 19px;
}
.exam-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-bottom: 13px;
}
.exam-symbol {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: #ad9cc9;
  background: #f2eef9;
  font-size: 17px;
}
.exam-status {
  padding: 5px 8px;
  font-size: 10px;
  border-radius: 7px;
  color: #8a7a9f;
  background: #f7f4fb;
}
.exam-status.urgent {
  color: #bc8b70;
  background: #fbf0e7;
}
.exam-name {
  margin: 0 0 11px;
  font-size: 16px;
  line-height: 1.5;
  color: #4e4c64;
}
.exam-time {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12px;
  color: #7d8498;
  line-height: 1.8;
}
.exam-time .van-icon {
  font-size: 14px;
  margin-top: 3px;
}
.exam-card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 15px;
  padding-top: 15px;
  margin-top: 17px;
  border-top: 1px dashed #e9eaf1;
}
.exam-location,
.exam-seat {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.exam-location {
  flex: 1;
  min-width: 0;
}
.exam-location > span,
.exam-seat > span {
  font-size: 9px;
  color: #b0b4c2;
}
.exam-location strong {
  color: #747a90;
  font-size: 13px;
  line-height: 1.6;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.exam-seat {
  text-align: right;
  flex-shrink: 0;
  min-width: 45px;
}
.exam-seat strong {
  color: #a08ebf;
  font-size: 20px;
  font-weight: 600;
}
.exam-seat small {
  font-size: 9px;
  margin-left: 4px;
  font-weight: 400;
}
.past .exam-symbol {
  background: #f3f4f6;
  color: #b6bac6;
}
.past .exam-name,
.past .exam-seat strong {
  color: #989dad;
}
@media (min-width: 700px) {
  .exam-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .nearest-banner {
    padding: 25px 30px;
  }
  .next-course h2 {
    font-size: 23px;
  }
  .exam-countdown strong {
    font-size: 58px;
  }
}
</style>
