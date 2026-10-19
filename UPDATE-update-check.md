# 启动检查 GitHub 更新

本工程已包含教学周自动递增、左右滑动切换周/日、APK 启动检查更新，以及 PWA 离线网页版。网页部署请以 WEB-DEPLOY.md 为准。

## 使用方式

- 每次启动 Android 应用自动检查一次 GitHub 最新正式 Release，不阻塞登录和课表加载。
- 新版本弹窗显示当前版本、最新版本、更新说明、安装包下载链接与发布页入口；可以选择“稍后再说”。
- Android 的“我的 → 关于应用 → 检查更新”可以主动重试。PWA 则检查网页资源版本。
- 自动检查在离线、超时、GitHub 限流或响应异常时保持安静；手动检查失败会给出提示。
- 按数字比较版本，例如 1.0.10 大于 1.0.9；忽略草稿、预发布、相同版本和旧版本。
- 仅支持 Android，更新只选择 APK。安装包缺失或有多个无法确定的分架构 APK 时提供发布页入口，避免下载错误架构。

## 发布来源与版本号

仓库已从 Norlive666/class_keke 更名为 Norlive666/SDUST_Campus_App。

- 更新来源：https://api.github.com/repos/Norlive666/SDUST_Campus_App/releases/latest
- 发布页：https://github.com/Norlive666/SDUST_Campus_App/releases
- 使用 GitHub 公开 API，不需要给应用配置 GitHub Token。
- 原生应用读取已安装 APK 的真实版本，网页端使用构建版本并通过 Service Worker 检查网页更新；已同步调整现有工作流中的网页版本号，使它们与 Release 的 v1.0.<运行次数> 对齐。
- 当前工作流在 main/master 更新后构建并发布 Release。发布新的正式版本并上传对应安装包后，已安装本次功能版本的用户下次启动即可检查到更新。只改源码、没有发布 Release，不会触发升级提示。
- 新设备或旧应用必须先手动安装一次带此功能的版本，此前的旧版本无法凭空获得检测能力。

## 合并到 GitHub

1. 备份仓库，解压完整源码 ZIP，进入包含 package.json、src、android 的目录。
2. 在当前仓库根目录使用 Add file → Upload files 上传目录中的内容，避免多套一层父目录。
3. 如果仓库仍有 ios 目录，请手动删除整个目录。网页上传不会自动删除旧文件。
4. 本次包含依赖和工作流调整，务必一起更新 package.json、pnpm-lock.yaml、.github/workflows/build-android.yml，以及 android 内相关配置。注意某些文件管理器会隐藏 .github 目录。
5. 提交到修复分支，通过 Pull Request 合并到 main；也可按原来的手动上传方式提交。
6. 打开 Actions 查看构建结果，完成后从 Releases 下载安装包。本 ZIP 仅含源码，未包含重新编译的 APK。

## 本地检查与编译

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm build
pnpm exec cap sync android
```

本次新增 @capacitor/browser 6.x，已同步 Android 插件依赖。GitHub Actions 会重新执行 Capacitor 同步。若手动制作正式安装包，请保持原生版本号与 Release 标签一致。

## 安装说明

下载由用户点击链接发起，应用不会静默下载或安装。本工程已移除 iOS 原生工程、相关依赖和 IPA 构建发布流程。

Android 当前工作流使用 assembleDebug。覆盖更新要求新旧安装包的签名一致；若不同构建使用了不同调试密钥，系统可能无法直接覆盖安装。持续分发时应使用并妥善保存同一签名密钥。更新检查不会修改现有签名配置。

## 验证范围

浏览器自动化覆盖启动弹窗、数字版本比较、旧版本与预发布过滤、手动重试、下载链接、无安装包回退、网络异常和重复检查。Android 原生插件同步已完成；本次没有执行原生重新编译或真机下载测试。
