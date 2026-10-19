# 山科小站 PWA 网页版部署与使用

现支持 Android APK + PWA 网页版。苹果通过 Safari 添加到主屏幕使用，不构建 IPA，不需要苹果签名。

## 已实现

- 桌面图标、独立窗口打开、苹果安全区域适配。
- 首次联网缓存完成后，可断网重新打开，并查看已同步课表、成绩、考试。
- 离线按日期递增教学周、左右滑动切换周次/日程。
- 我的页面显示“已可离线打开”并提供添加到桌面说明；断网时显示离线状态。
- 网页部署新版本后显示“立即刷新”，不会自动打断正在使用的页面。
- 安卓继续使用 GitHub Release 的 APK 更新提醒；网页检查网页资源版本，不提示安装 APK。
- 网页凭据以 AES-GCM 加密后保存到本机 IndexedDB，密钥不可导出；登录失效时复用原有验证码识别与自动恢复流程。浏览器存储被清理后需要重新登录。此存储能力不等同于 Android Keystore。

## 必须先部署，再添加到桌面

此交付尚未发布公网网址。需要一个可运行 Node.js 或 Docker 的服务器，以及指向该服务器的域名。

只部署 dist 到 GitHub Pages 等静态托管平台，能够缓存界面，但无法完整登录、刷新教务数据。因为浏览器需要本工程的同源 /api/jsxsd/ 代理来处理学校 Cookie 与跨域请求。代理服务只连接固定教务域名和指定接口，不提供任意 URL 代理，不在服务端保存密码或共享用户会话。

请部署在自己可信的服务器上。该服务器必须能访问 https://jwglxt.sdust.edu.cn；如果学校接口只允许校园网络访问，服务器也需要相应网络条件。未使用真实学生账号验证公网教务连接。

## 方法一：Docker 一键部署

将完整工程上传到服务器并解压。在工程根目录运行（把域名替换为自己的）：

```bash
DOMAIN=class.example.com docker compose -f deploy/compose.yml up -d --build
```

域名应已解析到服务器，80/443 端口可访问。Caddy 会处理 HTTPS，并把网站和接口转发到同一个 Node 服务。后续使用相同命令重新部署即可。

使用 GitHub Actions 发布的 SDUST_Campus_Web_v*.zip 时，解压后使用同一条命令。该包已经包含 dist 和运行时 Dockerfile，不需要再次编译前端。

查看日志：

```bash
docker compose -f deploy/compose.yml logs --tail=100
```

日志不包含教务账号、密码或 Cookie。

## 方法二：已有 HTTPS 反向代理 + Node.js

服务器需 Node.js 20+。从源码构建：

```bash
pnpm install --frozen-lockfile
pnpm build
PUBLIC_ORIGIN=https://class.example.com PORT=3000 NODE_ENV=production node server/app.mjs
```

然后将整个网站域名反向代理到 127.0.0.1:3000，并确保 PUBLIC_ORIGIN 与用户访问的网址完全一致。程序必须持续运行，可使用 systemd 或已有进程管理器。

如果使用已构建的 Web ZIP，只需解压并运行最后一条 Node 命令，不需要安装 pnpm 或 Node 依赖。

- 必须保留 /api/jsxsd/、/sw.js 和网页同源。
- 不要给 sw.js、index.html、manifest 配置永久缓存；Node 服务已提供相应缓存头。
- 不要禁用学校 HTTPS 证书验证；如服务器需要附加受信任 CA，可使用 Node 标准 NODE_EXTRA_CA_CERTS 配置。
- 目前按域名根路径部署，不支持放在 /class_keke/ 等子目录。

## 本地预览

```bash
pnpm build
pnpm start:web
```

电脑打开 http://127.0.0.1:3000。localhost 可以测试 Service Worker；手机访问局域网 HTTP 地址不具备同样条件，实际安装应使用 HTTPS。

## 苹果手机使用

1. 使用 Safari 打开部署后的 HTTPS 网址。
2. 分享 → 添加到主屏幕；如有“作为网页 App 打开”，请开启。
3. 建议从桌面图标重新进入，联网完成一次登录和课表、成绩、考试同步。
4. 打开“我的”，确认显示“已可离线打开”。
5. 之后断网可通过桌面图标查看已缓存数据，联网后点击刷新可查询最新数据。

没有缓存的数据无法离线查询。首次登录、验证码和教务数据更新需要网络。苹果可能在清理网站数据、存储不足等情况下删除缓存；再次联网打开可以重建缓存。

## 更新、退出与缓存

- 修改网页后重新部署；用户再次联网打开时会检查 Service Worker，准备完成后显示刷新提示。
- 接受更新会切换应用资源缓存，保留已同步数据和本机凭据。
- 退出登录会清除缓存的用户数据、本机凭据，并在联网时清理代理会话 Cookie。离线退出时会记录待清理状态，在下一次联网查询前完成会话清理。
- Service Worker 只缓存页面和静态资源，不缓存验证码、学校接口响应或 GitHub 接口响应。
- Android 不注册 Service Worker，继续使用 APK 自带页面和 Keystore，IPA 构建保持移除。

## 上传合并

将完整工程文件上传至仓库根目录，务必包含 public、pwa、server、deploy 和 .github 目录。上传不会自动删除旧文件，若仓库仍有 ios 目录，仍需手动删除。合并后现有 Android 工作流会同时上传 Web 部署包到 Release。

## 验证命令

```bash
pnpm test
pnpm test:server
pnpm test:pwa
pnpm build
pnpm cap:sync
```

自动测试验证了 Chromium 中的离线关闭/重开、深链接子页面、跨周、安装清单、资源更新、加密凭据、代理 Cookie 隔离及重定向。本次没有真实 iPhone 或真实教务账号测试，首次部署后请用 Safari 和自己的账号验证登录及离线打开。
