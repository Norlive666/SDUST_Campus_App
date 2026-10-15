<template>
  <main class="login-page">
    <header class="login-topbar">
      <div class="brand">
        <span class="brand-mark"
          ><svg viewBox="0 0 40 40" aria-hidden="true">
            <path
              d="M8 28 20 9l12 19H8Z"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linejoin="round"
            />
            <path
              d="m14 28 6-9 6 9"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            />
            <circle cx="29" cy="10" r="3" fill="#c7b8f2" /></svg></span
        ><span>山科小站<small>SDUST CAMPUS</small></span>
      </div>
      <button
        v-if="userStore.isLoggedIn"
        class="back-link"
        @click="router.replace('/timetable')"
      >
        返回课表 <van-icon aria-hidden="true" name="arrow" /></button
      ><span v-else class="campus-label">校园教务助手</span>
    </header>
    <div class="login-layout">
      <section class="login-intro">
        <span class="intro-label"><i></i> 给校园日常，一点从容</span>
        <h1>每一天，<br />都有<span>好安排。</span></h1>
        <p>课表、成绩与考试，<br />在这里，一目了然。</p>
        <div class="intro-art" aria-hidden="true">
          <div class="art-orbit"></div>
          <div class="art-calendar">
            <div class="art-calendar-top">
              <span>我的校园</span><van-icon aria-hidden="true" name="calendar-o" />
            </div>
            <div class="art-days">
              <i v-for="n in 7" :key="n" :class="{ marked: n === 4 }"></i>
            </div>
            <div class="art-course">
              <span></span>
              <div><b>专注当下</b><small>把时间留给热爱的事</small></div>
              <van-icon aria-hidden="true" name="passed" />
            </div>
            <div class="art-lines"><i></i><i></i></div>
          </div>
          <div class="art-float">
            <van-icon aria-hidden="true" name="notes-o" /><span
              >井井有条<small>轻装出发</small></span
            >
          </div>
          <span class="art-spark">✦</span>
        </div>
      </section>
      <section class="login-card" aria-labelledby="login-title">
        <div class="form-heading">
          <span class="form-kicker">欢迎回来</span>
          <h2 id="login-title">
            {{ userStore.isLoggedIn ? "验证教务登录" : "登录教务账号" }}
          </h2>
          <p>使用山东科技大学教务系统账号</p>
        </div>
        <form @submit.prevent="onSubmit">
          <div class="input-group">
            <label for="student-account">学号</label>
            <div class="input-shell">
              <van-icon aria-hidden="true" name="user-o" /><input
                id="student-account"
                v-model.trim="account"
                name="username"
                autocomplete="username"
                inputmode="numeric"
                placeholder="请输入学号"
                required
                :disabled="loading"
              />
            </div>
          </div>
          <div class="input-group">
            <label for="student-password">教务密码</label>
            <div class="input-shell">
              <van-icon aria-hidden="true" name="lock" /><input
                id="student-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                placeholder="请输入教务系统密码"
                required
                :disabled="loading"
              /><button
                type="button"
                class="password-toggle"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <van-icon aria-hidden="true" :name="showPassword ? 'eye-o' : 'closed-eye'" />
              </button>
            </div>
          </div>
          <div class="input-group">
            <div class="captcha-label">
              <label for="student-captcha">验证码</label
              ><span v-if="autoRecognized"
                ><van-icon aria-hidden="true" name="passed" /> 已自动识别</span
              >
            </div>
            <div class="captcha-row">
              <div class="input-shell">
                <van-icon aria-hidden="true" name="shield-o" /><input
                  id="student-captcha"
                  v-model.trim="captcha"
                  name="captcha"
                  autocomplete="off"
                  maxlength="6"
                  :placeholder="recognizing ? '正在识别…' : '输入验证码'"
                  required
                  :disabled="loading || recognizing"
                />
              </div>
              <button
                type="button"
                class="captcha-button"
                aria-label="刷新验证码"
                :disabled="recognizing || loading"
                @click="loadCaptcha"
              >
                <van-loading v-if="recognizing" size="18" color="#7d6bd4" /><img
                  v-else-if="captchaBase64"
                  :src="captchaBase64"
                  alt="教务验证码"
                /><span v-else><van-icon aria-hidden="true" name="replay" /> 重新获取</span>
              </button>
            </div>
            <p class="captcha-hint" aria-live="polite">
              {{ captchaError || "看不清？点击右侧图片更换验证码" }}
            </p>
          </div>
          <van-button
            block
            round
            type="primary"
            native-type="submit"
            :loading="loading"
            :disabled="recognizing"
            class="login-submit"
            >{{ loading ? "正在连接教务…" : "登录并进入"
            }}<van-icon aria-hidden="true" v-if="!loading" name="arrow"
          /></van-button>
        </form>
        <div class="login-assurance">
          <van-icon aria-hidden="true" name="shield-o" /><span
            >首次登录后，下次打开可直接查看已缓存内容</span
          >
        </div>
        <button
          class="help-toggle"
          :aria-expanded="showHelp"
          @click="showHelp = !showHelp"
        >
          <van-icon aria-hidden="true" name="question-o" /> 登录遇到问题？<van-icon
            :name="showHelp ? 'arrow-up' : 'arrow-down'"
          />
        </button>
        <div v-if="showHelp" class="login-help">
          <p>
            请确认账号密码与学校教务系统一致。无法连接时，请检查校园网或学校提供的
            VPN。
          </p>
          <p>
            验证码可自动识别，也可以手动修改。会话失效后可在此重新验证登录。
          </p>
        </div>
      </section>
    </div>
    <footer class="login-footer">
      山科小站 <span>·</span> 让学习生活更有序
    </footer>
  </main>
</template>
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { showToast, showNotify } from "vant";
import { api } from "../services/api";
import { recognizeVerifyCode } from "../services/captcha";
import { useUserStore } from "../stores/user";
import { useTimetableStore } from "../stores/timetable";
const router = useRouter();
const userStore = useUserStore();
const timetableStore = useTimetableStore();
const account = ref("");
const password = ref("");
const captcha = ref("");
const captchaBase64 = ref("");
const autoRecognized = ref(false);
const recognizing = ref(false);
const showPassword = ref(false);
const loading = ref(false);
const showHelp = ref(false);
const captchaError = ref("");
const loadCaptcha = async () => {
  if (recognizing.value || loading.value) return;
  recognizing.value = true;
  autoRecognized.value = false;
  captcha.value = "";
  captchaBase64.value = "";
  captchaError.value = "";
  try {
    await api.getPreLoginInfo();
    const image = await api.getCaptchaBase64();
    captchaBase64.value = image;
    const code = await recognizeVerifyCode(image);
    if (code.length === 4) {
      captcha.value = code;
      autoRecognized.value = true;
    }
  } catch (_) {
    captchaError.value = "验证码获取失败，请检查网络后点击右侧重试";
  } finally {
    recognizing.value = false;
  }
};
const onSubmit = async () => {
  if (loading.value || recognizing.value) return;
  loading.value = true;
  let retryCaptcha = false;
  try {
    const result = await userStore.login(
      account.value,
      password.value,
      captcha.value,
    );
    if (result.success) {
      password.value = "";
      try {
        await timetableStore.fetchTimetable("");
      } catch (_) {
        showToast("登录成功，课表暂未同步，可稍后刷新");
      }
      if (result.rememberFailed)
        showNotify({
          type: "warning",
          message: "已登录，但自动登录凭据未能保存，下次会话过期需重新验证",
        });
      router.replace("/timetable");
    } else {
      showNotify({
        type: "warning",
        message: result.message || "登录失败，请重试",
      });
      retryCaptcha = true;
    }
  } catch (_) {
    showNotify({ type: "danger", message: "连接失败，请检查校园网后重试" });
    retryCaptcha = true;
  } finally {
    loading.value = false;
    if (retryCaptcha) loadCaptcha();
  }
};
onMounted(() => {
  userStore.init();
  account.value = userStore.account;
  loadCaptcha();
});
</script>
<style scoped>
.login-page {
  min-height: 100dvh;
  padding: 24px 22px 22px;
  max-width: 1120px;
  margin: 0 auto;
  background: radial-gradient(ellipse at 80% 10%, #ece6fc80, transparent 55%);
}
.login-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #38334f;
  font-size: 15px;
  font-weight: 750;
  text-decoration: none;
}
.brand-mark {
  width: 40px;
  height: 40px;
  background: #eae5fb;
  border-radius: 13px;
  padding: 3px;
  color: #7866ce;
}
.brand small {
  display: block;
  color: #9a94ae;
  font-size: 7px;
  letter-spacing: 1.6px;
  font-weight: 500;
  margin-top: 5px;
}
.campus-label,
.back-link {
  font-size: 10px;
  color: #9690a9;
}
.back-link {
  border: 0;
  background: none;
  padding: 12px 0;
  cursor: pointer;
}
.login-layout {
  max-width: 440px;
  margin: 0 auto;
}
.login-intro {
  position: relative;
  padding: 35px 0 27px;
}
.intro-label {
  color: #8f81bd;
  font-size: 10px;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.intro-label i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #9a87da;
}
h1 {
  font-size: 32px;
  line-height: 1.4;
  letter-spacing: -1px;
  margin: 12px 0 9px;
  font-weight: 750;
}
h1 span {
  color: #7b65cf;
}
.login-intro > p {
  font-size: 11px;
  color: #9792a5;
  line-height: 1.9;
  margin: 0;
}
.intro-art {
  position: absolute;
  right: 1px;
  top: 47px;
  width: 146px;
  height: 144px;
  pointer-events: none;
}
.art-orbit {
  position: absolute;
  width: 125px;
  height: 125px;
  border: 1px solid #e7e0f6;
  border-radius: 50%;
  right: -4px;
  top: -8px;
}
.art-calendar {
  position: absolute;
  width: 119px;
  height: 125px;
  background: linear-gradient(155deg, #fff, #f3effb);
  border: 1px solid white;
  box-shadow: 0 12px 30px #6a50a515;
  border-radius: 17px;
  transform: rotate(9deg);
  right: 7px;
  padding: 12px;
}
.art-calendar-top {
  display: flex;
  justify-content: space-between;
  color: #a294c2;
  font-size: 7px;
}
.art-days {
  display: flex;
  gap: 5px;
  margin: 13px 0;
}
.art-days i {
  width: 8px;
  height: 11px;
  border-radius: 3px;
  background: #e7e1f3;
}
.art-days .marked {
  background: #9c83db;
}
.art-course {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 8px;
  color: #9683bd;
}
.art-course > span {
  width: 4px;
  height: 23px;
  background: #baa8e4;
  border-radius: 4px;
}
.art-course b {
  display: block;
  font-size: 8px;
  font-weight: 600;
}
.art-course small {
  display: block;
  font-size: 5px;
  margin-top: 5px;
}
.art-lines i {
  display: block;
  width: 65px;
  height: 4px;
  background: #eae4f5;
  margin: 9px 0 0 8px;
  border-radius: 4px;
}
.art-lines i:last-child {
  width: 45px;
}
.art-float {
  position: absolute;
  bottom: 0;
  left: -4px;
  padding: 9px 12px;
  display: flex;
  gap: 6px;
  background: #ffffffed;
  box-shadow: 0 6px 25px #6a50a512;
  border-radius: 12px;
  color: #8b78c5;
  transform: rotate(-7deg);
}
.art-float > .van-icon {
  background: #f0eafb;
  padding: 5px;
  border-radius: 7px;
  font-size: 16px;
}
.art-float span {
  font-size: 8px;
  color: #5a506d;
  padding-top: 3px;
}
.art-float small {
  display: block;
  margin-top: 4px;
  font-size: 6px;
  color: #a299b1;
}
.art-spark {
  position: absolute;
  right: -4px;
  bottom: 5px;
  color: #c9b9e8;
  font-size: 21px;
}
.login-card {
  border: 1px solid #ebe8f1;
  border-radius: 24px;
  padding: 25px 22px 18px;
  background: #ffffffef;
  box-shadow: 0 6px 30px #3c265c03;
}
.form-kicker {
  color: #a092b7;
  font-size: 10px;
  letter-spacing: 1px;
}
.form-heading h2 {
  font-size: 21px;
  margin: 7px 0 8px;
  color: #353044;
}
.form-heading p {
  font-size: 11px;
  color: #86798f;
  margin: 0 0 24px;
}
.input-group {
  margin-bottom: 17px;
}
.input-group label {
  display: block;
  font-size: 12px;
  color: #686174;
  margin-bottom: 9px;
  font-weight: 600;
}
.input-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 48px;
  border: 1px solid #ece9f2;
  border-radius: 12px;
  padding: 0 12px;
  background: #faf9fc;
  transition: border-color 0.15s;
}
.input-shell:focus-within {
  border-color: #a996dc;
  background: #fff;
  box-shadow: 0 0 0 3px #a996dc10;
}
.input-shell > .van-icon {
  color: #a89bbd;
  font-size: 17px;
}
.input-shell input {
  width: 100%;
  min-width: 0;
  background: none;
  border: 0;
  outline: 0;
  height: 46px;
  color: #51465f;
  font: inherit;
  font-size: 13px;
}
.input-shell input::placeholder {
  color: #968aa3;
}
.password-toggle {
  padding: 10px 0 10px 5px;
  border: 0;
  background: none;
  color: #a79ab9;
  font-size: 18px;
  cursor: pointer;
}
.captcha-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.captcha-label > span {
  color: #7c9a88;
  font-size: 9px;
}
.captcha-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 94px;
  gap: 9px;
}
.captcha-button {
  display: grid;
  place-items: center;
  border: 1px solid #ece9f2;
  border-radius: 12px;
  background: #f7f4fc;
  cursor: pointer;
  min-width: 0;
  padding: 5px;
}
.captcha-button img {
  width: 78px;
  max-width: 100%;
  height: 29px;
  object-fit: contain;
}
.captcha-button span {
  font-size: 10px;
  color: #9687b2;
}
.captcha-hint {
  font-size: 9px;
  line-height: 1.6;
  color: #8e7e9e;
  margin: 8px 0 0;
}
.login-submit {
  height: 49px;
  margin-top: 6px;
  border: 0;
  border-radius: 13px;
  background: #7a66cc;
  box-shadow: 0 5px 15px #7a66cc20;
  font-size: 13px;
  font-weight: 600;
}
.login-submit .van-icon {
  margin-left: 12px;
  font-size: 12px;
}
.login-assurance {
  display: flex;
  gap: 5px;
  justify-content: center;
  align-items: center;
  font-size: 10px;
  color: #8e829e;
  margin-top: 15px;
  line-height: 1.6;
}
.help-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  justify-content: center;
  width: 100%;
  margin-top: 18px;
  padding: 13px 0 0;
  border: 0;
  border-top: 1px solid #f0edf5;
  background: none;
  color: #7e6e90;
  font-size: 10px;
  cursor: pointer;
}
.help-toggle > .van-icon:last-child {
  margin-left: 5px;
}
.login-help {
  color: #9c92aa;
  font-size: 10px;
  line-height: 1.8;
  padding-top: 8px;
}
.login-footer {
  text-align: center;
  margin-top: 24px;
  font-size: 9px;
  letter-spacing: 1px;
  color: #aca3b7;
}
.login-footer span {
  margin: 0 7px;
}
.login-page button:focus-visible,
.login-page a:focus-visible {
  outline: 3px solid #b6a9f0;
  outline-offset: 3px;
}
@media (min-width: 800px) {
  .login-page {
    padding: 36px 48px;
    display: flex;
    flex-direction: column;
  }
  .login-layout {
    display: grid;
    grid-template-columns: 1fr 390px;
    gap: 70px;
    width: 100%;
    max-width: none;
    margin: auto 0;
    padding: 50px 0;
    align-items: center;
  }
  .login-intro {
    padding-bottom: 160px;
  }
  h1 {
    font-size: 46px;
  }
  .login-intro > p {
    font-size: 14px;
  }
  .intro-art {
    top: auto;
    bottom: -10px;
    right: 20px;
    transform: scale(1.35);
  }
  .login-footer {
    margin-top: auto;
  }
}
@media (max-width: 359px) {
  .login-page {
    padding: 20px 16px;
  }
  h1 {
    font-size: 27px;
  }
  .intro-art {
    transform: scale(0.85);
    transform-origin: right center;
    right: -4px;
  }
  .login-card {
    padding: 22px 18px 16px;
  }
}
</style>
