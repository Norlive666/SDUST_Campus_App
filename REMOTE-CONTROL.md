# 山科小站网页版遥控器

在网页登录页点击「遥控器（免登录）」，在课表点击「遥控器」，或直接打开部署域名的 `/remote-control.html`。该页面不需要教务登录，不读取课表账号或数据。其控制协议来自 [Norlive666/remote-control](https://github.com/Norlive666/remote-control/tree/codex/remote-control)，沿用 20 字节 v2 帧，STM32 接收驱动必须支持 v2。

## iPhone 蓝牙直连

1. 安装 [Bluefy](https://apps.apple.com/app/id1492822055)。从 Safari 的遥控页复制 HTTPS 地址，粘贴到 Bluefy 地址栏。
2. 在 Bluefy 点击面板中央的「FSC-BT630」，从浏览器的设备选择器选择自己的 BT630。网页使用 FFF0 服务、FFF2 写入和 FFF1 通知。
3. 第一帧发送成功后才显示已连接。先在接收端观察有效帧计数和中位值，再手动开启使能。关闭使能后控制量归零。

短按连接面板可快捷连接、取消重试或断开。长按后松手可以选择其他设备，也可以从「面板设置 → 连接与后台」选择。蓝牙异常断开会自动重试至多五次。如果浏览器支持恢复已授权设备，重新打开页面也可快捷连接。网页在切后台或离开页面时停发并断开。手柄依赖浏览器的标准 Gamepad API，需在目标 iPhone 和 Bluefy 上确认。

## 局域网调试（rc-tune / OpenOCD / SWD）

1. 电脑和手机连同一可信局域网。按 [rc-tune 原项目指南](https://github.com/Norlive666/remote-control/blob/codex/remote-control/docs/rc-tune-guide.md) 在 VS Code 启动匹配固件的 OpenOCD 调试会话与 rc-tune。网页服务默认只转发到本机 `127.0.0.1:8765`。
2. 从山科小站仓库运行生产构建，然后启动局域网页面。证书需匹配访问地址并受手机信任；用电脑实际的局域网 IP 替换示例。

   ```sh
   pnpm build
   RC_LAN_HOST=192.168.1.10 RC_LAN_CERT=/path/to/cert.pem RC_LAN_KEY=/path/to/key.pem node server/remote-lan.mjs
   ```

   仅在自己控制的测试网络可以显式使用 HTTP；该模式令牌与指令不加密，且浏览器可能不提供手柄 API。

   ```sh
   RC_LAN_HOST=192.168.1.10 RC_LAN_ALLOW_HTTP=1 node server/remote-lan.mjs
   ```

3. 在「功能选项 → 连接与后台」选「局域网调试」，填入终端显示的地址并打开，也可从手机直接访问该地址。在电脑提供的网页中填写终端生成的**网页调试令牌**，再连接。网页服务使用独立的 8766 端口。若 rc-tune 本身配置了令牌，启动网页服务时通过本地环境变量 `RC_TUNE_TOKEN` 提供。
4. 连接后诊断页可回读 `g_rc`。网页只通过现有桥接器的 health、state、frame 接口访问；局域网帧和令牌不经过 Cloudflare。LAN 和公网入口各自在自己的浏览器站点保存布局及映射。

## 控制与验收

- 摇杆支持自由、单轴、四向、死区及最大值。四路通道可设置连续或多档滑块，支持瞬时、长短按和循环按钮。功能选项中可分别移动、缩放蓝色摇杆区与白色卡片，并调整 X/Y/L1/R1/L2/R2 映射。
- 手动断开尽力补发急停帧，断流依赖接收端或 rc-tune 的看门狗。重新连接时默认禁用，必要时手动重新使能。蓝牙写入成功不是 MCU 收包确认；SWD 回读一致也不等于业务程序已经应用控制量。
- 实机验收可先断开执行机构，只观察接收状态，分别验证 BLE 和 SWD 的 20 字节帧、使能、断开时的停止帧、退出到后台及重连后禁用。调试链路写 RAM，测试时应关闭 BLE 输出。
- 本地验证：`node src/remote/protocol.test.mjs`（Node 22+）与 `pnpm test:pwa`。浏览器用模拟 BLE 和模拟 rc-tune 验证协议/链路，不能代替 iPhone 与接收板实测。
