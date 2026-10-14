<template>
  <div class="login-container">
    <div class="brand-section">
      <div class="logo-wrapper">
        <svg viewBox="0 0 100 100" class="logo-svg">
          <circle cx="50" cy="50" r="46" fill="#4F46E5" />
          <path d="M25 65 L50 25 L75 65 Z" fill="#ffffff" opacity="0.9" />
          <path d="M40 65 L50 48 L60 65 Z" fill="#4F46E5" />
          <circle cx="50" cy="22" r="5" fill="#f59e0b" />
        </svg>
      </div>
      <h1 class="app-title">山科小站</h1>
      <p class="app-subtitle">山东科技大学移动教务助手</p>
    </div>

    <div class="login-card">
      <van-form @submit="onSubmit">
        <van-cell-group inset class="form-group">
          <van-field
            v-model="account"
            name="account"
            label="学号"
            placeholder="请输入您的教务学号"
            type="digit"
            :rules="[{ required: true, message: '请填写学号' }]"
          >
            <template #left-icon>
              <van-icon name="user-o" class="field-icon" />
            </template>
          </van-field>

          <van-field
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            label="密码"
            placeholder="请输入强智教务密码"
            :right-icon="showPassword ? 'eye-o' : 'closed-eye'"
            @click-right-icon="showPassword = !showPassword"
            :rules="[{ required: true, message: '请填写密码' }]"
          >
            <template #left-icon>
              <van-icon name="lock" class="field-icon" />
            </template>
          </van-field>

          <van-field
            v-model="captcha"
            name="captcha"
            label="验证码"
            placeholder="输入右侧验证码"
            maxlength="6"
            :rules="[{ required: true, message: '请填写验证码' }]"
          >
            <template #left-icon>
              <van-icon name="shield-o" class="field-icon" />
            </template>
            <template #button>
              <div class="captcha-img-box" @click="loadCaptcha">
                <img v-if="captchaBase64" :src="captchaBase64" alt="验证码" class="captcha-img" />
                <span v-else class="captcha-loading">加载中</span>
              </div>
            </template>
          </van-field>
        </van-cell-group>

        <div class="btn-group">
          <van-button
            round
            block
            type="primary"
            native-type="submit"
            :loading="loading"
            class="submit-btn"
          >
            立即登录
          </van-button>

          <van-button
            round
            block
            plain
            type="default"
            @click="onDemoLogin"
            class="demo-btn"
          >
            一键体验 / 演示模式 (免校网)
          </van-button>
        </div>
      </van-form>

      <div class="tips-card">
        <div class="tips-title">
          <van-icon name="info-o" />
          <span>山科大教务特别说明</span>
        </div>
        <p>1. 账号密码与学校强智教务系统 (jwglxt.sdust.edu.cn) 一致。</p>
        <p>2. 系统采用端对端原生加密与本地 Cookie 存储，不会在任何第三方服务器保存您的账号密码。</p>
        <p>3. 若您当前未连接校园网或在外网访问受阻，推荐直接点击“一键体验/演示模式”进入系统。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showNotify } from 'vant';
import { api } from '../services/api';
import { useUserStore } from '../stores/user';
import { useTimetableStore } from '../stores/timetable';

const router = useRouter();
const userStore = useUserStore();
const timetableStore = useTimetableStore();

const account = ref('');
const password = ref('');
const captcha = ref('');
const captchaBase64 = ref('');
const showPassword = ref(false);
const loading = ref(false);

const loadCaptcha = async () => {
  try {
    captchaBase64.value = await api.getCaptchaBase64();
  } catch (e: any) {
    showToast('验证码刷新失败，请检查网络');
  }
};

const onSubmit = async () => {
  loading.value = true;
  try {
    const res = await userStore.login(account.value, password.value, captcha.value, false);
    if (res.success) {
      showToast({ type: 'success', message: '登录成功' });
      await timetableStore.fetchTimetable(userStore.curTerm);
      router.replace('/timetable');
    } else {
      showNotify({ type: 'warning', message: res.message || '登录失败，请重试' });
      loadCaptcha();
    }
  } catch (e: any) {
    showNotify({ type: 'danger', message: '网络连接失败，请确认是否处于校园网' });
    loadCaptcha();
  } finally {
    loading.value = false;
  }
};

const onDemoLogin = async () => {
  userStore.login('', '', '', true);
  await timetableStore.fetchTimetable(userStore.curTerm);
  showToast({ type: 'success', message: '已进入山科大演示模式' });
  router.replace('/timetable');
};

onMounted(() => {
  userStore.init();
  if (userStore.account) {
    account.value = userStore.account;
  }
  loadCaptcha();
});
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 50%, #60a5fa 100%);
  padding: 40px 20px 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.brand-section {
  text-align: center;
  color: #ffffff;
  margin-bottom: 28px;
}

.logo-wrapper {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  background: rgba(255, 255, 255, 0.2);
  padding: 8px;
  border-radius: 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

.logo-svg {
  width: 100%;
  height: 100%;
}

.app-title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
  letter-spacing: 2px;
}

.app-subtitle {
  font-size: 13px;
  opacity: 0.85;
  margin-top: 6px;
}

.login-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 24px 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);
}

.form-group {
  margin: 0 0 16px;
  border-radius: 16px;
  border: 1px solid #f1f5f9;
}

.field-icon {
  font-size: 18px;
  color: #6366f1;
  margin-right: 8px;
}

.captcha-img-box {
  width: 90px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  cursor: pointer;
  border: 1px solid #e2e8f0;
}

.captcha-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.captcha-loading {
  font-size: 12px;
  color: #94a3b8;
}

.btn-group {
  margin-top: 24px;
}

.submit-btn {
  background: linear-gradient(135deg, #4f46e5, #3b82f6);
  border: none;
  font-weight: 600;
  font-size: 16px;
  height: 46px;
  box-shadow: 0 8px 18px rgba(79, 70, 229, 0.35);
}

.demo-btn {
  margin-top: 12px;
  border-color: #cbd5e1;
  color: #475569;
  font-size: 14px;
  height: 42px;
}

.tips-card {
  margin-top: 24px;
  padding: 14px;
  background: #f8fafc;
  border-radius: 14px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
}

.tips-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #4f46e5;
  font-weight: 600;
  margin-bottom: 6px;
}
</style>
