# 山科小站 (SDUST Campus App) - Android 版

专为**山东科技大学（SDUST）**定制的移动端教务助手 Android 原生体验应用。基于现代前端生态与 Capacitor 原生混合架构开发，重构自开源项目 `WindrunnerMax/SHST`。

当前界面版本：**1.0.13**。登录、成绩、考试与个人中心采用统一浅色布局；原有课表布局保持不变。

---

## 🌟 核心功能特色

1. **教务安全登录**：
   * 适配山科大最新强智教务协议（`https://jwglxt.sdust.edu.cn/jsxsd/`）。
   * 包含动态获取 `scode` 和 `sxh` 种子秘钥的交叉混淆加密算法。
   * 支持图形验证码拉取与点击刷新。
2. **智能课表系统 (Timetable)**：
   * 支持周视图网格与 1~20 教学周自由切换。
   * 自动高亮当天课程、当前教学周识别（非本周课程自动灰显）。
   * 单双周上课自动过滤，避免排课混乱。
   * 点击课程卡片弹出查看教室、教师、作息时间等详细信息。
   * **离线本地持久化**：首次拉取后缓存在手机，校园网断开也能随时看课表。
3. **成绩与绩点系统 (Grade)**：
   * 实时自动换算 **加权平均分** 与 **平均学分绩点 (GPA)**。
   * 支持按学期（如 2024-2025-1、全部学期）筛选。
   * 统计总修读学分、通过学分与挂科高亮标记。
4. **考试日程与倒计时 (Exam)**：
   * 考场教学楼与具体教室（如 J1-101、J7-202）。
   * 精确座位号展示与距考天数倒计时卡片。
5. **个人中心与设置 (Profile)**：
   * 学期切换、当前教学周自定义。
   * 离线缓存一键清理。

---

## 🏗 技术栈选型

* **跨端核心引擎**：[Capacitor 6](https://capacitorjs.com/)（原生 Android 容器 + 原生网络栈）
* **前端框架**：Vue 3 + TypeScript + Vite 5 + Pinia
* **移动端 UI**：Vant 4（移动端组件库）
* **网络与会话管理**：
  * Android 原生环境：`@capacitor/core` 原生 HTTP（无 CORS 跨域限制，自动保持与传递 Cookie）
  * Web 调试环境：Vite Dev Proxy 代理转发

---

## 📁 目录结构

```text
keke/
├── android/                   # Android 原生 Studio 工程 (Gradle / Manifest / Java)
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml # 配置了网络权限与 usesCleartextTraffic
│   │   └── assets/public/     # Web 静态产物资源
├── src/
│   ├── services/
│   │   ├── encrypt.ts         # 强智系统密码混淆加密算法
│   │   ├── http.ts            # Capacitor 原生 HTTP 与 Web 适配器
│   │   ├── parser.ts          # 课表、成绩、考试 HTML 结构化解析器
│   │   └── api.ts             # 教务系统统一调用接口
│   ├── stores/
│   │   ├── user.ts            # 用户状态与凭据管理
│   │   └── timetable.ts       # 课表数据与课程卡片色彩管理
│   ├── views/
│   │   ├── LoginView.vue      # 登录界面
│   │   ├── TimetableView.vue  # 课表主界面
│   │   ├── GradeView.vue      # 成绩与绩点主界面
│   │   ├── ExamView.vue       # 考试日程界面
│   │   ├── ProfileView.vue    # 个人设置
│   │   └── MainLayout.vue     # 底部导航容器
│   ├── router/index.ts        # 路由与鉴权拦截
│   ├── App.vue
│   └── main.ts
├── capacitor.config.ts        # Capacitor 配置文件
├── vite.config.ts             # Vite 构建与开发代理
└── package.json
```

---

## 🚀 启动与构建指南

### 1. 本地网页调试运行
```bash
# 启动开发服务器（支持热重载，自动配置山科大教务跨域代理）
pnpm dev
```
打开浏览器访问 `http://localhost:5173` 即可快速预览。

### 2. 编译并同步到 Android 工程
```bash
# 编译前端代码并自动更新到 android/app/src/main/assets
pnpm run cap:build
```

### 3. 打包生成 Android APK
方式一：使用 **Android Studio** 打开：
```bash
# 自动启动 Android Studio 打开 android/ 目录
pnpm run cap:open
```
在 Android Studio 中点击菜单 `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)`，即可在 `android/app/build/outputs/apk/debug/` 下生成 `app-debug.apk`。

方式二：命令行直接打包：
```bash
cd android
./gradlew assembleDebug
```
生成的 APK 即可直接安装到任何安卓手机上使用！
