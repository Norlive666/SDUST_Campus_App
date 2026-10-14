<template>
  <div class="timetable-page">
    <!-- 顶部导航栏 -->
    <header class="top-nav">
      <div class="week-selector" @click="showWeekPicker = true">
        <span class="week-title">第 {{ timetableStore.selectedWeek }} 周</span>
        <span v-if="timetableStore.selectedWeek === userStore.curWeek" class="current-badge">本周</span>
        <van-icon name="arrow-down" class="arrow-icon" />
      </div>

      <div class="nav-actions">
        <van-button size="small" round icon="replay" :loading="timetableStore.isLoading" @click="onRefresh" class="refresh-btn">
          刷新
        </van-button>
      </div>
    </header>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh" class="pull-refresh-box">
      <!-- 星期与日期表头 -->
      <div class="dates-header">
        <div class="month-col">
          <span class="month-text">{{ currentMonth }}月</span>
        </div>
        <div
          v-for="(dayName, idx) in weekDays"
          :key="idx"
          class="day-col"
          :class="{ 'is-today': idx === todayDayIndex && timetableStore.selectedWeek === userStore.curWeek }"
        >
          <span class="day-name">{{ dayName }}</span>
          <span class="day-date">{{ getDayDate(idx) }}</span>
        </div>
      </div>

      <!-- 课表主体网格 -->
      <div class="timetable-grid">
        <!-- 左侧节次及作息时间表 -->
        <div class="time-sidebar">
          <div v-for="(slot, sIdx) in timeSlots" :key="sIdx" class="time-slot-cell">
            <span class="slot-num">{{ slot.name }}</span>
            <span class="slot-time">{{ slot.start }}</span>
            <span class="slot-time">{{ slot.end }}</span>
          </div>
        </div>

        <!-- 右侧课程网格 (5 行 × 7 列) -->
        <div class="grid-content">
          <div v-for="(slot, sIdx) in timeSlots" :key="sIdx" class="grid-row">
            <div
              v-for="(_, dIdx) in 7"
              :key="dIdx"
              class="grid-cell"
              :class="{ 'cell-today': dIdx === todayDayIndex && timetableStore.selectedWeek === userStore.curWeek }"
            >
              <template v-if="getCourse(dIdx, sIdx)">
                <div
                  class="course-card"
                  :style="{ backgroundColor: getCourse(dIdx, sIdx)?.displayColor }"
                  :class="{ 'course-not-cur-week': !getCourse(dIdx, sIdx)?.isCurrentWeek }"
                  @click="openCourseDetail(getCourse(dIdx, sIdx)!)"
                >
                  <div class="course-name">{{ getCourse(dIdx, sIdx)?.name }}</div>
                  <div class="course-room">@{{ getCourse(dIdx, sIdx)?.classroom || '教室未定' }}</div>
                  <div v-if="!getCourse(dIdx, sIdx)?.isCurrentWeek" class="not-cur-tag">非本周</div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div v-if="timetableStore.courses.length === 0 && !timetableStore.isLoading" class="empty-hint">
        <van-icon name="info-o" />
        <span>当前学期暂未查询到课表，可下拉刷新或在“我的”中切换学期</span>
      </div>
    </van-pull-refresh>

    <!-- 周次选择器弹窗 -->
    <van-popup v-model:show="showWeekPicker" round position="bottom">
      <div class="picker-header">
        <span class="picker-title">选择教学周</span>
        <van-button size="small" type="primary" round @click="showWeekPicker = false">确定</van-button>
      </div>
      <div class="week-grid-container">
        <div
          v-for="w in 20"
          :key="w"
          class="week-chip"
          :class="{
            'chip-active': w === timetableStore.selectedWeek,
            'chip-current': w === userStore.curWeek
          }"
          @click="selectWeek(w)"
        >
          第 {{ w }} 周
        </div>
      </div>
    </van-popup>

    <!-- 课程详情弹窗 -->
    <van-dialog v-model:show="showDetailDialog" :title="activeCourse?.name" confirm-button-text="知道了">
      <div class="course-detail-content" v-if="activeCourse">
        <div class="detail-item">
          <van-icon name="location-o" class="detail-icon" />
          <span class="label">上课地点：</span>
          <span class="val">{{ activeCourse.classroom || '待定' }}</span>
        </div>
        <div class="detail-item">
          <van-icon name="user-o" class="detail-icon" />
          <span class="label">授课教师：</span>
          <span class="val">{{ activeCourse.teacher || '未知教师' }}</span>
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
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { showToast } from 'vant';
import { useTimetableStore } from '../stores/timetable';
import { useUserStore } from '../stores/user';
import { CourseItem } from '../services/parser';

const timetableStore = useTimetableStore();
const userStore = useUserStore();

const showWeekPicker = ref(false);
const showDetailDialog = ref(false);
const activeCourse = ref<CourseItem | null>(null);
const refreshing = ref(false);

const weekDays = ['一', '二', '三', '四', '五', '六', '日'];
const timeSlots = [
  { name: '1-2', start: '08:00', end: '09:35' },
  { name: '3-4', start: '10:05', end: '11:40' },
  { name: '5-6', start: '14:00', end: '15:35' },
  { name: '7-8', start: '16:00', end: '17:35' },
  { name: '9-10', start: '19:00', end: '20:35' },
];

const currentMonth = computed(() => {
  return new Date().getMonth() + 1;
});

const todayDayIndex = computed(() => {
  return (new Date().getDay() + 6) % 7;
});

const getDayDate = (dayIndex: number): string => {
  const now = new Date();
  const currentDay = (now.getDay() + 6) % 7;
  const diffDays = dayIndex - currentDay;
  const targetDate = new Date(now.getTime() + diffDays * 86400000);
  return `${targetDate.getDate()}日`;
};

const getCourse = (dayIndex: number, sectionIndex: number) => {
  return timetableStore.getCourseAt(dayIndex, sectionIndex, timetableStore.selectedWeek);
};

const selectWeek = (w: number) => {
  timetableStore.selectedWeek = w;
  showWeekPicker.value = false;
};

const openCourseDetail = (course: CourseItem) => {
  activeCourse.value = course;
  showDetailDialog.value = true;
};

const getSectionDesc = (sec: number): string => {
  const slot = timeSlots[sec];
  return slot ? `第 ${slot.name} 节 (${slot.start} - ${slot.end})` : `第 ${sec + 1} 大节`;
};

const onRefresh = async () => {
  try {
    await timetableStore.fetchTimetable(userStore.curTerm || '');
    showToast({ type: 'success', message: '课表已同步' });
  } catch (_) {
    showToast('同步失败，请检查网络');
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => {
  userStore.init();
  timetableStore.init();
  timetableStore.selectedWeek = userStore.curWeek;
  if (timetableStore.courses.length === 0) {
    timetableStore.fetchTimetable(userStore.curTerm || '');
  }
});
</script>

<style scoped>
.timetable-page {
  min-height: 100vh;
  background-color: #f8fafc;
  padding-bottom: 70px;
  box-sizing: border-box;
}

.top-nav {
  height: 52px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  position: sticky;
  top: 0;
  z-index: 20;
}

.week-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.week-title {
  font-size: 17px;
  font-weight: 700;
  color: #1e293b;
}

.current-badge {
  background: #e0e7ff;
  color: #4338ca;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: 600;
}

.arrow-icon {
  font-size: 14px;
  color: #64748b;
}

.refresh-btn {
  border-color: #e2e8f0;
  color: #475569;
}

.dates-header {
  display: flex;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  padding: 8px 0;
}

.month-col {
  width: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  border-right: 1px dashed #e2e8f0;
}

.day-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.day-name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.day-date {
  font-size: 11px;
  color: #94a3b8;
}

.is-today .day-name,
.is-today .day-date {
  color: #4f46e5;
  font-weight: 700;
}

.is-today {
  background: #eef2ff;
  border-radius: 8px;
  padding: 2px 0;
}

.timetable-grid {
  display: flex;
  margin-top: 4px;
}

.time-sidebar {
  width: 38px;
  display: flex;
  flex-direction: column;
}

.time-slot-cell {
  height: 110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-bottom: 1px dashed #e2e8f0;
  font-size: 10px;
  color: #64748b;
  background: #ffffff;
}

.slot-num {
  font-weight: 700;
  color: #334155;
  margin-bottom: 2px;
}

.slot-time {
  transform: scale(0.85);
  line-height: 1.1;
}

.grid-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.grid-row {
  display: flex;
  height: 110px;
}

.grid-cell {
  flex: 1;
  border-right: 1px dashed #f1f5f9;
  border-bottom: 1px dashed #f1f5f9;
  padding: 2px;
  box-sizing: border-box;
}

.cell-today {
  background-color: rgba(99, 102, 241, 0.03);
}

.course-card {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  color: #ffffff;
  padding: 6px 4px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  overflow: hidden;
  position: relative;
}

.course-name {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-room {
  font-size: 10px;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.course-not-cur-week {
  opacity: 0.55;
  filter: grayscale(40%);
}

.not-cur-tag {
  font-size: 9px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
  text-align: center;
  padding: 1px 0;
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

.week-grid-container {
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
  background: #4f46e5 !important;
  color: #ffffff !important;
  font-weight: 700;
}

.chip-current {
  border: 1px solid #4f46e5;
  color: #4f46e5;
}

.course-detail-content {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.detail-icon {
  color: #6366f1;
  font-size: 16px;
  margin-right: 8px;
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
  margin: 20px 16px;
  padding: 12px;
  background: #f1f5f9;
  border-radius: 10px;
  font-size: 12px;
  color: #64748b;
}
</style>
