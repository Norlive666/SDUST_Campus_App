<template>
  <div class="timetable-page">
    <header class="top-nav">
      <div>
        <span class="eyebrow">山科小站 · {{ userStore.curTerm }}</span>
        <h1>我的课表<span class="title-dot"></span></h1>
      </div>
      <button
        class="icon-btn"
        aria-label="同步课表"
        :disabled="timetableStore.isLoading"
        @click="onRefresh"
      >
        <van-icon
          name="replay"
          :class="{ 'spin-icon': timetableStore.isLoading }"
        />
      </button>
    </header>

    <section class="week-toolbar" aria-label="教学周导航">
      <button
        class="icon-btn"
        aria-label="上一周"
        :disabled="timetableStore.selectedWeek <= 1"
        @click="prevWeek"
      >
        <van-icon name="arrow-left" />
      </button>
      <button class="week-title-btn" @click="showWeekPicker = true">
        <strong>第 {{ timetableStore.selectedWeek }} 周</strong
        ><span
          >{{ weekDateList[0].date }} — {{ weekDateList[6].date }}
          <van-icon name="arrow-down"
        /></span>
      </button>
      <button
        class="icon-btn"
        aria-label="下一周"
        :disabled="timetableStore.selectedWeek >= 25"
        @click="nextWeek"
      >
        <van-icon name="arrow" />
      </button>
      <button
        class="return-btn"
        :disabled="timetableStore.selectedWeek === userStore.curWeek"
        @click="selectWeek(userStore.curWeek)"
      >
        本周
      </button>
    </section>

    <div class="view-toolbar">
      <div class="segmented" aria-label="课表视图">
        <button
          :class="{ selected: viewMode === 'week' }"
          :aria-pressed="viewMode === 'week'"
          @click="viewMode = 'week'"
        >
          周课表</button
        ><button
          :class="{ selected: viewMode === 'day' }"
          :aria-pressed="viewMode === 'day'"
          @click="viewMode = 'day'"
        >
          日程
        </button>
      </div>
      <button
        v-if="viewMode === 'week'"
        class="weekend-toggle"
        :aria-pressed="showWeekend"
        @click="showWeekend = !showWeekend"
      >
        {{ showWeekend ? "收起周末" : "显示周末"
        }}<span v-if="!showWeekend && weekendCount" class="weekend-count">{{
          weekendCount
        }}</span
        ><van-icon :name="showWeekend ? 'arrow-left' : 'arrow'" />
      </button>
      <span v-else class="schedule-count">{{ dayCourses.length }} 门课程</span>
    </div>

    <div v-if="syncError" class="sync-error" role="status">
      <span>{{ syncError }}</span
      ><router-link v-if="needsLogin" to="/login?reauth=1"
        >重新验证</router-link
      >
    </div>
    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <div
        v-if="timetableStore.isLoading && !timetableStore.courses.length"
        class="loading-state"
      >
        <van-loading color="#4f46e5" vertical>正在同步课表…</van-loading>
      </div>
      <template v-else>
        <div
          v-if="viewMode === 'week'"
          class="week-board"
          :style="{ '--day-count': visibleDays.length }"
        >
          <div class="dates-header">
            <span class="axis-heading">节次</span>
            <div
              v-for="day in visibleDays"
              :key="day.index"
              class="date-col"
              :class="{ 'date-active': day.isToday }"
            >
              <span>{{ day.name }}</span
              ><strong>{{ day.date.split("/")[1] }}</strong>
            </div>
          </div>
          <div
            v-for="(slot, section) in timeSlots"
            :key="slot.name"
            class="grid-row"
          >
            <div class="time-axis">
              <strong>{{ slot.name }}</strong
              ><span>{{ slot.start }}</span
              ><span>{{ slot.end }}</span>
            </div>
            <div
              v-for="day in visibleDays"
              :key="day.index"
              class="grid-cell"
              :class="{ 'today-column': day.isToday }"
            >
              <button
                v-for="course in courseAt(day.index, section)"
                :key="course.name"
                class="course-card"
                :style="{ '--course-color': course.displayColor }"
                :class="{ 'is-not-cur-week': !course.isCurrentWeek }"
                @click="openCourseDetail(course)"
              >
                <span class="card-name">{{ course.name }}</span
                ><span class="card-room">{{
                  course.classroom || "教室待定"
                }}</span
                ><span v-if="!course.isCurrentWeek" class="card-note"
                  >非本周</span
                ><span v-if="course.hasConflict" class="card-note"
                  >另有课程 · 查看</span
                >
              </button>
            </div>
          </div>
        </div>
        <div v-else class="day-view">
          <div class="day-selector" aria-label="选择日期">
            <button
              v-for="day in weekDateList"
              :key="day.index"
              :class="{ selected: selectedDay === day.index }"
              :aria-pressed="selectedDay === day.index"
              @click="selectedDay = day.index"
            >
              <span>{{ day.name }}</span
              ><strong>{{ day.date.split("/")[1] }}</strong
              ><i v-if="day.isToday"></i>
            </button>
          </div>
          <div class="day-heading">
            <h2>
              {{
                weekDateList[selectedDay].isToday
                  ? "今日安排"
                  : weekDateList[selectedDay].name + "的安排"
              }}
            </h2>
            <span>第 {{ timetableStore.selectedWeek }} 周</span>
          </div>
          <button
            v-for="course in dayCourses"
            :key="course.name + course.section"
            class="agenda-card"
            :style="{ '--course-color': course.displayColor }"
            @click="openCourseDetail(course)"
          >
            <div class="agenda-time">
              <strong>{{ timeSlots[course.section]?.start }}</strong
              ><span>{{ timeSlots[course.section]?.end }}</span>
            </div>
            <div class="agenda-info">
              <h3>{{ course.name }}</h3>
              <span
                ><van-icon name="location-o" />
                {{ course.classroom || "教室待定" }}</span
              >
              <p>
                {{ course.teacher || "教师待定" }} · 第
                {{ timeSlots[course.section]?.name }} 节
              </p>
            </div>
            <van-icon name="arrow" />
          </button>
          <van-empty
            v-if="!dayCourses.length"
            image="leaf"
            description="当天没有课程，安排自己的节奏吧"
          />
        </div>
        <div v-if="!timetableStore.courses.length" class="empty-hint">
          <span>{{
            loadFailed ? "同步失败，可重试或检查网络" : "当前学期暂无课程"
          }}</span
          ><button @click="onRefresh">重新同步</button>
        </div>
        <p v-else-if="viewMode === 'week'" class="board-hint">
          <span class="hint-dot"></span> 点击课程查看详情
          <span>浅灰卡片为非本周课程</span>
        </p>
      </template>
    </van-pull-refresh>

    <van-popup
      v-model:show="showWeekPicker"
      round
      position="bottom"
      safe-area-inset-bottom
    >
      <div class="picker-header">
        <span class="picker-title">选择教学周</span
        ><van-button
          size="small"
          type="primary"
          plain
          round
          @click="selectWeek(userStore.curWeek)"
          >回到本周</van-button
        >
      </div>
      <div class="week-grid-container">
        <button
          v-for="w in 25"
          :key="w"
          class="week-chip"
          :class="{
            'chip-active': w === timetableStore.selectedWeek,
            'chip-current': w === userStore.curWeek,
          }"
          @click="selectWeek(w)"
        >
          {{ w }}<small v-if="w === userStore.curWeek">本周</small>
        </button>
      </div>
    </van-popup>
    <!-- 课程详情弹窗 -->
    <van-dialog
      v-model:show="showDetailDialog"
      :title="activeCourse?.name"
      confirm-button-text="知道了"
    >
      <div class="course-detail-content" v-if="activeCourse">
        <!-- 如果该时段有多门课程，全部详细列出 -->
        <template
          v-if="activeCourse.allCourses && activeCourse.allCourses.length > 1"
        >
          <div
            v-for="(c, cIdx) in activeCourse.allCourses"
            :key="cIdx"
            class="conflict-course-item"
            :class="{
              'conflict-active': c.weeks.includes(timetableStore.selectedWeek),
            }"
          >
            <div class="conflict-title">
              {{ c.name }}
              <span
                v-if="c.weeks.includes(timetableStore.selectedWeek)"
                class="active-badge"
                >当前周上课</span
              >
            </div>
            <div class="detail-item">
              <van-icon name="clock-o" class="detail-icon" /><span
                class="val"
                >{{ getSectionDesc(c.section) }}</span
              >
            </div>
            <div class="detail-item">
              <van-icon name="location-o" class="detail-icon" />
              <span class="label">教室：</span>
              <span class="val">{{ c.classroom || "待定" }}</span>
            </div>
            <div class="detail-item">
              <van-icon name="user-o" class="detail-icon" />
              <span class="label">教师：</span>
              <span class="val">{{ c.teacher || "未知教师" }}</span>
            </div>
            <div class="detail-item">
              <van-icon name="calendar-o" class="detail-icon" />
              <span class="label">周次：</span>
              <span class="val">{{ c.rawWeeks }}</span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="detail-item">
            <van-icon name="location-o" class="detail-icon" />
            <span class="label">上课地点：</span>
            <span class="val">{{ activeCourse.classroom || "待定" }}</span>
          </div>
          <div class="detail-item">
            <van-icon name="user-o" class="detail-icon" />
            <span class="label">授课教师：</span>
            <span class="val">{{ activeCourse.teacher || "未知教师" }}</span>
          </div>
          <div class="detail-item">
            <van-icon name="calendar-o" class="detail-icon" />
            <span class="label">周次范围：</span>
            <span class="val">{{ activeCourse.rawWeeks }}</span>
          </div>
          <div class="detail-item">
            <van-icon name="clock-o" class="detail-icon" />
            <span class="label">节次时段：</span>
            <span class="val">{{ getSectionDesc(activeCourse.section) }}</span>
          </div>
        </template>
      </div>
    </van-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { SessionExpiredError } from "../services/response";
import { showToast } from "vant";
import { useTimetableStore } from "../stores/timetable";
import { useUserStore } from "../stores/user";
import { CourseItem } from "../services/parser";

const timetableStore = useTimetableStore();
const userStore = useUserStore();

const showWeekPicker = ref(false);
const showDetailDialog = ref(false);
const activeCourse = ref<(CourseItem & { allCourses?: CourseItem[] }) | null>(
  null,
);
const refreshing = ref(false);
const loadFailed = ref(false);
const syncError = ref("");
const needsLogin = ref(false);
const viewMode = ref<"week" | "day">("week");
const showWeekend = ref(false);
const selectedDay = ref((new Date().getDay() + 6) % 7);

const weekDayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const timeSlots = [
  { name: "1-2", start: "08:00", end: "09:35" },
  { name: "3-4", start: "10:05", end: "11:40" },
  { name: "5-6", start: "14:00", end: "15:35" },
  { name: "7-8", start: "16:00", end: "17:35" },
  { name: "9-10", start: "19:00", end: "20:35" },
];

/**
 * 动态推算所选教学周 7 天的日期 (格式如 10/12, 10/13... 并在当天下方标出激活指示条)
 */
const weekDateList = computed(() => {
  const now = new Date();
  const currentDayOfWeek = (now.getDay() + 6) % 7; // 0=Mon ... 6=Sun

  // 以当周周一为基准
  const thisMonday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - currentDayOfWeek,
  );
  const weekDiff = timetableStore.selectedWeek - userStore.curWeek;
  const targetMonday = new Date(thisMonday.getTime() + weekDiff * 7 * 86400000);

  return weekDayLabels.map((name, idx) => {
    const d = new Date(targetMonday.getTime() + idx * 86400000);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dateStr = `${m}/${day < 10 ? "0" + day : day}`;
    const isToday =
      timetableStore.selectedWeek === userStore.curWeek &&
      idx === currentDayOfWeek;
    return {
      name,
      index: idx,
      date: dateStr,
      isToday,
    };
  });
});

const visibleDays = computed(() =>
  showWeekend.value ? weekDateList.value : weekDateList.value.slice(0, 5),
);
const weekendCount = computed(
  () =>
    timetableStore.courses.filter(
      (c) => c.day >= 5 && c.weeks.includes(timetableStore.selectedWeek),
    ).length,
);
const dayCourses = computed(() =>
  timetableStore.courses
    .filter(
      (c) =>
        c.day === selectedDay.value &&
        c.weeks.includes(timetableStore.selectedWeek),
    )
    .sort((a, b) => a.section - b.section)
    .map((c) => ({
      ...c,
      displayColor:
        timetableStore.getCourseAt(
          c.day,
          c.section,
          timetableStore.selectedWeek,
        )?.displayColor || "#4f46e5",
    })),
);
const courseAt = (day: number, section: number) => {
  const course = getCourse(day, section);
  return course ? [course] : [];
};

const getCourse = (dayIndex: number, sectionIndex: number) => {
  return timetableStore.getCourseAt(
    dayIndex,
    sectionIndex,
    timetableStore.selectedWeek,
  );
};

const prevWeek = () => {
  if (timetableStore.selectedWeek > 1) {
    timetableStore.selectedWeek--;
  }
};

const nextWeek = () => {
  if (timetableStore.selectedWeek < 25) {
    timetableStore.selectedWeek++;
  }
};

const selectWeek = (w: number) => {
  timetableStore.selectedWeek = w;
  showWeekPicker.value = false;
};

const openCourseDetail = (
  course: CourseItem & { allCourses?: CourseItem[] },
) => {
  activeCourse.value = course;
  showDetailDialog.value = true;
};

const getSectionDesc = (sec: number): string => {
  const slot = timeSlots[sec];
  return slot
    ? `第 ${slot.name} 节 (${slot.start} - ${slot.end})`
    : `第 ${sec + 1} 大节`;
};

const onRefresh = async () => {
  if (timetableStore.isLoading) return;
  loadFailed.value = false;
  syncError.value = "";
  needsLogin.value = false;
  try {
    await timetableStore.fetchTimetable(userStore.curTerm || "");
    showToast({ type: "success", message: "课表已同步" });
  } catch (error) {
    loadFailed.value = true;
    needsLogin.value = error instanceof SessionExpiredError;
    syncError.value =
      error instanceof Error ? error.message : "同步失败，已保留原有课表";
    showToast(syncError.value);
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => {
  userStore.init();
  timetableStore.init();
  if (userStore.curWeek && userStore.curWeek > 0) {
    timetableStore.selectedWeek = userStore.curWeek;
  }
  if (timetableStore.courses.length === 0) {
    onRefresh();
  }
});
</script>

<style scoped>
.sync-error {
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
.sync-error span {
  flex: 1;
}
.sync-error a {
  flex-shrink: 0;
  color: #6151c8;
  font-weight: 600;
}
.timetable-page {
  padding: 24px 16px calc(90px + env(safe-area-inset-bottom));
  min-height: 100dvh;
  box-sizing: border-box;
}
.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.eyebrow {
  color: #7c849a;
  font-size: 11px;
  letter-spacing: 0.7px;
}
h1 {
  font-size: 28px;
  letter-spacing: -1px;
  margin: 7px 0 0;
  display: flex;
  align-items: center;
  gap: 9px;
}
.title-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8478ef;
}
button {
  font-family: inherit;
  cursor: pointer;
}
.icon-btn {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: 1px solid #e9eaf1;
  border-radius: 14px;
  background: white;
  color: #41465e;
  display: grid;
  place-items: center;
  font-size: 19px;
}
button:disabled {
  opacity: 0.35;
  cursor: default;
}
button:focus-visible {
  outline: 3px solid #a79bf5;
  outline-offset: 2px;
}
.week-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 22px;
}
.week-title-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: none;
  border: 0;
  color: #262b43;
}
.week-title-btn strong {
  font-size: 20px;
}
.week-title-btn span {
  font-size: 11px;
  color: #7c849a;
}
.return-btn {
  height: 44px;
  padding: 0 12px;
  background: #eae7fc;
  color: #6151c8;
  border: 0;
  border-radius: 14px;
  font-weight: 600;
}
.view-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.segmented {
  display: flex;
  gap: 3px;
  background: #eaeaf2;
  padding: 4px;
  border-radius: 12px;
}
.segmented button {
  border: 0;
  background: none;
  color: #85899d;
  border-radius: 9px;
  padding: 9px 17px;
  font-weight: 600;
  font-size: 12px;
}
.segmented .selected {
  background: white;
  color: #5f50c2;
  box-shadow: 0 2px 5px #2421460a;
}
.weekend-toggle {
  border: 0;
  background: none;
  color: #777d94;
  font-size: 12px;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.weekend-count {
  background: #eae7fc;
  border-radius: 6px;
  color: #6151c8;
  padding: 2px 5px;
  font-size: 10px;
}
.schedule-count {
  font-size: 12px;
  color: #85899d;
}
.week-board {
  background: white;
  border: 1px solid #e9eaf2;
  border-radius: 18px;
  overflow: hidden;
}
.dates-header,
.grid-row {
  display: grid;
  grid-template-columns: 32px repeat(var(--day-count), minmax(0, 1fr));
}
.dates-header {
  padding: 10px 4px;
  border-bottom: 1px solid #eff0f5;
}
.axis-heading {
  font-size: 9px;
  color: #a0a5b5;
  align-self: center;
  text-align: center;
}
.date-col {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 6px;
  font-size: 10px;
  color: #989cae;
}
.date-col strong {
  font-size: 14px;
  color: #444b65;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 10px;
}
.date-active strong {
  background: #6d5dd3;
  color: white;
  box-shadow: 0 3px 8px #6d5dd32b;
}
.date-active > span {
  color: #6d5dd3;
}
.grid-row {
  padding: 0 4px;
  min-height: 116px;
  border-bottom: 1px solid #f1f2f7;
}
.grid-row:last-child {
  border: 0;
}
.time-axis {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16px;
  gap: 4px;
  color: #a0a5b5;
  font-size: 8px;
}
.time-axis strong {
  color: #747b93;
  font-size: 10px;
  margin-bottom: 3px;
}
.grid-cell {
  min-width: 0;
  padding: 4px 2px;
  display: flex;
}
.today-column {
  background: #faf9ff;
}
.course-card {
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: #f1eefb;
  background: color-mix(in srgb, var(--course-color) 12%, white);
  color: #343b54;
  padding: 9px 4px 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 6px;
  overflow-wrap: anywhere;
}
.card-name {
  font-size: 11px;
  font-weight: 650;
  line-height: 1.55;
}
.card-room {
  font-size: 9px;
  line-height: 1.45;
  color: #636c83;
}
.card-note {
  font-size: 8px;
  color: #878d9e;
  margin-top: auto;
}
.is-not-cur-week {
  background: #f3f4f7;
  border-color: #d5d8e2;
  color: #8b90a0;
}
.is-not-cur-week .card-room {
  color: #989dad;
}
.board-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #9398aa;
  font-size: 10px;
  margin: 14px 3px;
  flex-wrap: wrap;
}
.board-hint > span:last-child {
  margin-left: auto;
}
.hint-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #9486de;
}
.day-selector {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  border-radius: 16px;
  background: white;
  border: 1px solid #e9eaf2;
}
.day-selector button {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  border-radius: 12px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  position: relative;
  color: #85899e;
  font-size: 10px;
}
.day-selector strong {
  font-size: 18px;
  color: #343b54;
}
.day-selector .selected {
  background: #6d5dd3;
  color: #e9e5ff;
}
.day-selector .selected strong {
  color: white;
}
.day-selector i {
  height: 3px;
  width: 3px;
  background: currentColor;
  border-radius: 50%;
  position: absolute;
  bottom: 4px;
}
.day-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 24px 2px 14px;
}
.day-heading h2 {
  font-size: 16px;
  margin: 0;
}
.day-heading > span {
  font-size: 11px;
  color: #9398aa;
}
.agenda-card {
  width: 100%;
  display: flex;
  align-items: center;
  text-align: left;
  padding: 18px 14px;
  margin-bottom: 12px;
  gap: 16px;
  border: 1px solid #e9eaf2;
  border-radius: 16px;
  background: white;
  color: #3b4259;
}
.agenda-time {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 11px;
  color: #989daf;
}
.agenda-time strong {
  color: #414860;
  font-size: 14px;
}
.agenda-info {
  flex: 1;
  padding-left: 14px;
  min-width: 0;
}
.agenda-info h3 {
  font-size: 15px;
  margin: 0 0 9px;
}
.agenda-info span {
  font-size: 12px;
  color: #717990;
}
.agenda-info p {
  color: #989daf;
  font-size: 11px;
  margin: 7px 0 0;
}
.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22px;
}
.picker-title {
  font-size: 18px;
  font-weight: 700;
}
.week-grid-container {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  padding: 0 22px 24px;
  max-height: 50vh;
  overflow: auto;
}
.week-chip {
  height: 52px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: #f4f4fa;
  color: #636b82;
  font-size: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.week-chip small {
  font-size: 8px;
}
.chip-current {
  border-color: #9b8ee0;
  color: #6d5dd3;
}
.chip-active {
  background: #6d5dd3;
  color: white;
}
.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  color: #9398aa;
  font-size: 13px;
}
.empty-hint button {
  border: 0;
  border-radius: 10px;
  background: #eae7fc;
  color: #6151c8;
  padding: 12px 18px;
}
.loading-state {
  padding: 100px 0;
}
.spin-icon {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (min-width: 600px) {
  .card-name {
    font-size: 14px;
  }
  .card-room {
    font-size: 12px;
  }
  .grid-row {
    min-height: 130px;
  }
  .course-card {
    padding: 12px 8px;
  }
  .dates-header,
  .grid-row {
    grid-template-columns: 44px repeat(var(--day-count), minmax(0, 1fr));
  }
  .time-axis {
    font-size: 10px;
  }
}
@media (max-width: 359px) {
  .timetable-page {
    padding-left: 8px;
    padding-right: 8px;
  }
  .grid-cell {
    padding: 3px 1px;
  }
  .course-card {
    padding: 7px 3px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin-icon {
    animation: none;
  }
}
/* 课程详情弹窗 */
.course-detail-content {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
}

.conflict-course-item {
  padding: 10px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 8px;
}

.conflict-course-item.conflict-active {
  background: #f0f9ff;
}

.conflict-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.active-badge {
  font-size: 11px;
  background: #0284c7;
  color: #ffffff;
  padding: 1px 6px;
  border-radius: 4px;
}

.detail-item {
  display: flex;
  align-items: center;
  font-size: 13px;
  margin-top: 4px;
}

.detail-icon {
  color: #0284c7;
  font-size: 15px;
  margin-right: 6px;
}

.detail-item .label {
  color: #64748b;
}

.detail-item .val {
  color: #1e293b;
  font-weight: 600;
}

.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 30px 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  font-size: 12px;
  color: #64748b;
}
</style>
