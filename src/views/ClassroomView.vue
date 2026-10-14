<template>
  <div class="classroom-page">
    <van-nav-bar
      title="空教室自习查询"
      left-text="返回"
      left-arrow
      @click-left="$router.back()"
    />

    <div class="filter-section">
      <div class="filter-chips">
        <span
          v-for="b in buildings"
          :key="b"
          class="chip"
          :class="{ 'chip-active': selectedBuilding === b }"
          @click="selectedBuilding = b"
        >
          {{ b }}
        </span>
      </div>
    </div>

    <div class="rooms-container">
      <div v-for="(room, idx) in filteredRooms" :key="idx" class="room-card">
        <div class="room-header">
          <span class="room-name">{{ room.room }}</span>
          <van-tag type="success" plain>{{ room.type }}</van-tag>
        </div>
        <div class="room-details">
          <span>所属楼栋: {{ room.building }}</span>
          <span>容纳座位: {{ room.seats }} 座</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { MOCK_CLASSROOMS } from '../services/mock';

const buildings = ['全部', 'J1教学楼', 'J7教学楼', 'J14机电楼'];
const selectedBuilding = ref('全部');

const filteredRooms = computed(() => {
  if (selectedBuilding.value === '全部') return MOCK_CLASSROOMS;
  return MOCK_CLASSROOMS.filter((r) => r.building === selectedBuilding.value);
});
</script>

<style scoped>
.classroom-page {
  min-height: 100vh;
  background-color: #f8fafc;
}

.filter-section {
  padding: 12px 16px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
}

.filter-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.chip {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  background: #f1f5f9;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
}

.chip-active {
  background: #4f46e5;
  color: #ffffff;
  font-weight: 600;
}

.rooms-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.room-card {
  background: #ffffff;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.room-name {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

.room-details {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
}
</style>
