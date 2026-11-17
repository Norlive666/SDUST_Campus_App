<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { clamp, hex, mapStick } from "./protocol";
import type { Stick } from "./protocol";
import { openBluetooth, openDebug, supportsBluetooth } from "./links";
import type { Link } from "./links";
import { startSession } from "./session";

type Control = { id: string; title: string; note: string; channel: number; kind: "slider" | "press" | "short-long" | "cycle"; short: number; long: number; cycle: string };
type Layout = { x: number; y: number; scale: number };
const KEY = "sdust-remote-settings-v1";
const padNames = ["X", "Y", "L1", "R1", "L2", "R2"];
const padIndexes = [2, 3, 4, 5, 6, 7];
const modes = { free: "自由", horizontal: "仅横向", vertical: "仅纵向", "four-way": "四向" };
const kinds = { slider: "滑块", press: "普通按钮", "short-long": "短按 / 长按", cycle: "点击循环" };
let controlSerial = 0;
const createControl = (channel: number): Control => ({
  id: `control-${Date.now()}-${controlSerial++}`, title: `滑块 ${channel + 1}`, note: "", channel, kind: "slider", short: 1, long: 2, cycle: "0,1,2",
});
const defaults = () => ({
  sticks: Array.from({ length: 2 }, (): Stick => ({ mode: "free", dead: 5, max: 1000 })),
  sliders: Array.from({ length: 4 }, () => ({ stepped: true, values: "0,1,2" })),
  controls: [createControl(0), createControl(1)],
  bindings: [0, 1, 0, 1, 2, 2].map((value, index) => ({ channel: [0, 0, 1, 1, 0, 1][index], value })),
  layout: {} as Record<string, Layout>,
});
const readSettings = () => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as ReturnType<typeof defaults> | null; }
  catch { return null; }
};
const config = ref(readSettings() || defaults());
const draft = ref(defaults());
const settings = ref("");
const editing = ref(false);
const selected = ref("");
const stage = ref<HTMLElement>();
const settingError = ref("");
const sectionNames = ["连接", "摇杆", "滑块", "自定义控件", "手柄映射", "通信诊断"];
const local = Boolean(document.querySelector('meta[name="rc-tune-bridge"]'));
const hasBluetooth = supportsBluetooth();
const pageUrl = new URL("/remote-control.html", location.href).href;
const mode = ref<"ble" | "lan">(local ? "lan" : "ble");
const token = ref("");
const lanUrl = ref("");
const lanUrlError = ref("");
const status = ref("未连接");
const detail = ref("");
const connection = ref<"idle" | "connecting" | "ready" | "closing">("idle");
const enabled = ref(false);
const stopped = ref(false);
const axes = reactive([0, 0, 0, 0]);
const channels = reactive([0, 0, 0, 0]);
const lastFrame = ref("—");
const received = ref("—");
const frameCount = ref(0);
const readback = ref("");
const padLabel = ref("未检测到标准手柄");
const pointer = new Map<number, number>();
const presses = new Map<string, { pointer: number; source: symbol; prior?: symbol; timer?: number; long: boolean }>();
const pulses = new Map<string, { source: symbol; channel: number; timer: number }>();
const owners: (symbol | undefined)[] = [];
const held = new Set<number>();
let padIndex: number | undefined;
let padReady = false;
let gamepadTimer = 0;
let generation = 0;
let connectAbort: AbortController | undefined;
let remembered: Awaited<ReturnType<typeof openBluetooth>>["device"] | undefined;
let retryTimer = 0;
let retry = 0;
let activeLink: Link | undefined;
let session: ReturnType<typeof startSession> | undefined;
let drag: { key: string; pointer: number; x: number; y: number; from: Layout } | undefined;
const shown = computed(() => editing.value ? draft.value : config.value);
const editable = computed(() => !settings.value && !editing.value && !stopped.value);

function values(text: string) {
  return text.split(/[,，\s]+/).filter(Boolean).map(Number);
}
function validValues(text: string) {
  const parsed = values(text);
  return parsed.length >= 2 && parsed.length <= 8 && new Set(parsed).size === parsed.length
    && parsed.every(value => Number.isInteger(value) && value >= 0 && value <= 1000);
}
function clearControls() {
  for (const press of presses.values()) window.clearTimeout(press.timer);
  for (const pulse of pulses.values()) window.clearTimeout(pulse.timer);
  presses.clear();
  pulses.clear();
  pointer.clear();
  held.clear();
  padReady = false;
  axes.fill(0);
  channels.fill(0);
  owners.length = 0;
}
function disarm(stop = false) {
  enabled.value = false;
  if (stop) stopped.value = true;
  clearControls();
}
function toggleEnable() {
  if (connection.value !== "ready" || settings.value || editing.value) return;
  if (enabled.value) return disarm();
  clearControls();
  stopped.value = false;
  enabled.value = true;
}
function failed(run: number, reason: unknown) {
  if (run !== generation) return;
  generation++;
  disarm(true);
  session?.cancel();
  activeLink = undefined;
  session = undefined;
  connection.value = "idle";
  status.value = "已停发";
  detail.value = reason instanceof Error ? reason.message : String(reason);
}

function retryBluetooth(run: number) {
  if (run !== generation) return;
  failed(run, "蓝牙已断开；重连后需手动使能");
  if (retry >= 5 || document.hidden) return;
  const delay = Math.min(1000 * 2 ** retry++, 5000);
  status.value = `蓝牙已断开 · ${delay / 1000} 秒后重试`;
  connection.value = "connecting";
  retryTimer = window.setTimeout(() => {
    connection.value = "idle";
    void connect(false, true);
  }, delay);
}

async function connect(pick = false, reconnecting = false) {
  if (connection.value !== "idle" || document.hidden) return;
  if (!reconnecting) retry = 0;
  disarm();
  stopped.value = false;
  const current = ++generation;
  const abort = connectAbort = new AbortController();
  connection.value = "connecting";
  status.value = "连接中";
  detail.value = "";
  lastFrame.value = received.value = "—";
  frameCount.value = 0;
  readback.value = "";
  try {
    let link: Link;
    if (mode.value === "ble") {
      const ble = await openBluetooth(abort.signal, () => retryBluetooth(current), bytes => { if (current === generation) received.value = hex(bytes); }, pick ? undefined : remembered);
      if (current === generation) remembered = ble.device;
      link = ble;
    } else link = await openDebug(token.value, abort.signal);
    if (current !== generation || document.hidden) {
      link.close();
      if (current === generation) await disconnect();
      return;
    }
    activeLink = link;
    status.value = `已连接 · ${link.name}`;
    connection.value = "ready";
    session = startSession(link, () => ({ axes, channels, enabled: enabled.value, stopped: stopped.value }), {
      sent(frame, note) {
        if (current !== generation) return;
        lastFrame.value = hex(frame);
        frameCount.value++;
        if (frameCount.value === 500) retry = 0;
        if (note) detail.value = note;
      },
      failed: error => failed(current, error),
    });
  } catch (error) {
    if (current === generation) {
      if (reconnecting) {
        retryBluetooth(current);
        return;
      }
      connection.value = "idle";
      status.value = "未连接";
      detail.value = error instanceof Error ? error.message : String(error);
    }
  } finally {
    if (connectAbort === abort) connectAbort = undefined;
  }
}
async function disconnect() {
  if (connection.value === "idle" || connection.value === "closing") return;
  generation++;
  disarm(true);
  window.clearTimeout(retryTimer);
  connectAbort?.abort();
  connection.value = "closing";
  const old = session;
  activeLink = undefined;
  session = undefined;
  await old?.stop();
  connection.value = "idle";
  status.value = "未连接";
}
function leaveIfHidden() {
  if (document.hidden) void disconnect();
}
window.addEventListener("pagehide", disconnect);
document.addEventListener("visibilitychange", leaveIfHidden);
onBeforeUnmount(() => {
  void disconnect();
  window.removeEventListener("pagehide", disconnect);
  document.removeEventListener("visibilitychange", leaveIfHidden);
  window.clearInterval(gamepadTimer);
});
async function refreshReadback() {
  const link = activeLink;
  try {
    const state = await link?.readState?.();
    if (link === activeLink && state) readback.value = JSON.stringify(state, null, 2);
  } catch (error) { if (link === activeLink) readback.value = String(error); }
}

function moveStick(event: PointerEvent, index: number) {
  const target = event.currentTarget as HTMLElement;
  if (!editable.value) return;
  if (event.type === "pointerdown") {
    if (pointer.has(index)) return;
    target.setPointerCapture(event.pointerId);
    pointer.set(index, event.pointerId);
  }
  if (pointer.get(index) !== event.pointerId) return;
  const box = target.getBoundingClientRect();
  const [x, y] = mapStick(
    2000 * ((event.clientX - box.left) / box.width - 0.5),
    2000 * (0.5 - (event.clientY - box.top) / box.height),
    config.value.sticks[index],
  );
  axes.splice(index * 2, 2, x, y);
}
function releaseStick(event: PointerEvent, index: number) {
  if (pointer.get(index) !== event.pointerId) return;
  pointer.delete(index);
  axes.splice(index * 2, 2, 0, 0);
}
function assign(channel: number, value: number, source = Symbol()) {
  owners[channel] = source;
  channels[channel] = value;
}
function assignSlider(control: Control, event: Event) {
  const raw = Number((event.target as HTMLInputElement).value);
  const slider = config.value.sliders[control.channel];
  assign(control.channel, slider.stepped ? values(slider.values)[raw] : raw * 10);
}
function sliderIndex(control: Control) {
  const slider = shown.value.sliders[control.channel];
  return slider.stepped ? Math.max(0, values(slider.values).indexOf(channels[control.channel])) : channels[control.channel] / 10;
}
function press(event: PointerEvent, control: Control) {
  if (!editable.value || presses.has(control.id)) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  const pulse = pulses.get(control.id);
  if (pulse) {
    window.clearTimeout(pulse.timer);
    if (owners[pulse.channel] === pulse.source) assign(pulse.channel, 0);
    pulses.delete(control.id);
  }
  const item: NonNullable<ReturnType<typeof presses.get>> = {
    pointer: event.pointerId, source: Symbol(), prior: owners[control.channel], long: false,
  };
  presses.set(control.id, item);
  if (control.kind === "press") assign(control.channel, control.short, item.source);
  if (control.kind === "short-long") item.timer = window.setTimeout(() => {
    item.long = true;
    if (owners[control.channel] === item.prior) assign(control.channel, control.long, item.source);
  }, 500);
}
function release(event: PointerEvent, control: Control) {
  const item = presses.get(control.id);
  if (!item || item.pointer !== event.pointerId) return;
  presses.delete(control.id);
  window.clearTimeout(item.timer);
  const channel = control.channel;
  if (event.type === "pointerup" && control.kind === "cycle" && owners[channel] === item.prior) {
    const steps = values(control.cycle);
    assign(channel, steps[(steps.indexOf(channels[channel]) + 1) % steps.length]);
  } else if (event.type === "pointerup" && control.kind === "short-long" && !item.long && owners[channel] === item.prior) {
    assign(channel, control.short, item.source);
    const timer = window.setTimeout(() => {
      pulses.delete(control.id);
      if (owners[channel] === item.source) assign(channel, 0);
    }, 500);
    pulses.set(control.id, { source: item.source, channel, timer });
  } else if (owners[channel] === item.source) assign(channel, 0);
}

if (navigator.getGamepads) gamepadTimer = window.setInterval(() => {
  if (document.hidden) return;
  const pad = Array.from(navigator.getGamepads()).find(item => item?.mapping === "standard" && item.axes.length >= 4);
  padLabel.value = pad?.id || "未检测到标准手柄";
  if (padIndex !== undefined && pad?.index !== padIndex) disarm();
  padIndex = pad?.index;
  if (!pad || !enabled.value || !editable.value) return;
  const left = mapStick(pad.axes[0] * 1000, -pad.axes[1] * 1000, config.value.sticks[0]);
  const right = mapStick(pad.axes[2] * 1000, -pad.axes[3] * 1000, config.value.sticks[1]);
  const pressed = padIndexes.map((button, i) => (pad.buttons[button]?.value || 0) >= (held.has(i) ? 0.4 : 0.6));
  if (!padReady) {
    padReady = [...left, ...right].every(value => value === 0) && !pressed.some(Boolean);
    return;
  }
  if (!pointer.has(0)) axes.splice(0, 2, ...left);
  if (!pointer.has(1)) axes.splice(2, 2, ...right);
  pressed.forEach((down, i) => {
    const binding = config.value.bindings[i];
    if (down && !held.has(i)) {
      held.add(i);
      assign(binding.channel, binding.value);
    } else if (!down) held.delete(i);
  });
}, 32);

function openSettings() {
  disarm();
  draft.value = JSON.parse(JSON.stringify(config.value));
  settings.value = "连接";
  settingError.value = "";
}
function closeSettings() {
  settings.value = "";
  editing.value = false;
  selected.value = "";
  drag = undefined;
}
function applySettings() {
  if (draft.value.sliders.some(slider => slider.stepped && !validValues(slider.values))
    || draft.value.controls.some(control => !control.title.trim()
      || ![control.short, control.long].every(v => Number.isInteger(v) && v >= 0 && v <= 1000)
      || (control.kind === "cycle" && !validValues(control.cycle)))
    || draft.value.sticks.some(stick => !Number.isInteger(stick.dead) || stick.dead < 0 || stick.dead > 30
      || !Number.isInteger(stick.max) || stick.max < 1 || stick.max > 1000)
    || draft.value.bindings.some(binding => !Number.isInteger(binding.value) || binding.value < 0 || binding.value > 1000)) {
    settingError.value = "名称不能为空；数值需在标示范围内；档位／循环值须为 2–8 个互不重复的整数。";
    return;
  }
  for (const binding of draft.value.bindings) {
    const slider = draft.value.sliders[binding.channel];
    const steps = values(slider.values);
    if (slider.stepped && !steps.includes(binding.value)) binding.value = steps[0];
  }
  config.value = JSON.parse(JSON.stringify(draft.value));
  try { localStorage.setItem(KEY, JSON.stringify(config.value)); } catch { /* optional persistence */ }
  closeSettings();
}
function setLanUrl() {
  try {
    const target = new URL(lanUrl.value.trim());
    const host = target.hostname;
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || !(
      /^(?:192\.168\.\d+|10\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+)\.\d+$/.test(host) || host.endsWith(".local")
    )) throw new Error();
    target.pathname = "/remote-control.html";
    target.search = target.hash = "";
    location.assign(target);
  } catch { lanUrlError.value = "请输入电脑提供的局域网地址，例如 http://192.168.1.10:8766"; }
}
const layout = (key: string) => shown.value.layout[key] ?? { x: 0, y: 0, scale: 100 };
function style(key: string) {
  const { x, y, scale } = layout(key);
  return { transform: `translate(${x}cqw, ${y}cqh) scale(${scale / 100})`, zIndex: selected.value === key ? 2 : undefined };
}
function dragStart(event: PointerEvent, key: string) {
  if (!editing.value || drag) return;
  selected.value = key;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  drag = { key, pointer: event.pointerId, x: event.clientX, y: event.clientY, from: layout(key) };
}
function dragMove(event: PointerEvent) {
  if (!drag || drag.pointer !== event.pointerId || !stage.value) return;
  const box = stage.value.getBoundingClientRect();
  draft.value.layout[drag.key] = {
    ...drag.from,
    x: clamp(drag.from.x + (event.clientX - drag.x) / box.width * 100, -55, 55),
    y: clamp(drag.from.y + (event.clientY - drag.y) / box.height * 100, -55, 55),
  };
}
function dragEnd(event: PointerEvent) { if (drag?.pointer === event.pointerId) drag = undefined; }
function resize(event: Event) {
  if (selected.value) draft.value.layout[selected.value] = { ...layout(selected.value), scale: Number((event.target as HTMLInputElement).value) };
}
watch(mode, () => { detail.value = ""; });
</script>

<template>
  <main class="remote">
    <header>
      <a v-if="!local" href="/timetable" class="back">‹ 课表</a>
      <h1>遥控器</h1>
      <button v-if="!settings && !editing" type="button" @click="openSettings">功能选项</button>
      <button v-else type="button" @click="closeSettings">取消</button>
    </header>

    <section v-if="!settings || editing" aria-label="控制面板">
      <div class="connection">
        <label>连接方式
          <select v-model="mode" :disabled="connection !== 'idle' || editing">
            <option value="ble">BT630 蓝牙</option>
            <option value="lan">局域网调试</option>
          </select>
        </label>
        <button v-if="mode === 'ble' && hasBluetooth || mode === 'lan' && local" type="button"
          :disabled="connection === 'closing' || editing" @click="connection === 'idle' ? connect() : disconnect()">
          {{ connection === "idle" ? "连接" : connection === "connecting" ? "取消连接" : "断开" }}
        </button>
        <button type="button" :disabled="connection !== 'ready' || editing" :aria-pressed="enabled" @click="toggleEnable">
          {{ enabled ? "关闭使能" : "使能" }}
        </button>
        <button type="button" class="stop" :aria-pressed="stopped" @click="disarm(true)">急停</button>
      </div>
      <p role="status" class="status">{{ status }}<span v-if="detail"> · {{ detail }}</span></p>
      <p v-if="mode === 'ble' && !hasBluetooth && !editing">
        iPhone 请将此页地址复制到 <a href="https://apps.apple.com/app/id1492822055" rel="noreferrer">Bluefy</a> 打开，再点击连接选择 BT630。
      </p>
      <input v-if="mode === 'ble' && !hasBluetooth && !editing" :value="pageUrl" readonly aria-label="遥控页地址" @focus="($event.target as HTMLInputElement).select()">
      <button v-if="mode === 'ble' && hasBluetooth && remembered && connection === 'idle' && !editing" type="button" @click="connect(true)">选择其他蓝牙设备</button>
      <label v-if="mode === 'lan' && local && !editing" class="lan-login">网页调试令牌
        <input v-model="token" type="password" autocomplete="off" :disabled="connection !== 'idle'" placeholder="电脑启动网页调试时显示">
      </label>
      <form v-if="mode === 'lan' && !local && !editing" class="lan-login" @submit.prevent="setLanUrl">
        <label>电脑的局域网调试地址<input v-model="lanUrl" type="url" placeholder="http://192.168.1.10:8766" required></label>
        <button type="submit">打开调试页</button>
        <span v-if="lanUrlError" role="alert">{{ lanUrlError }}</span>
      </form>
      <div v-if="editing" class="edit-bar">
        <span>拖动控件移动位置；选中后可缩放。</span>
        <select v-model="selected" aria-label="选中控件">
          <option value="" disabled>选择一个控件</option>
          <option value="stick-0">左摇杆</option><option value="stick-1">右摇杆</option>
          <option v-for="control in shown.controls" :key="control.id" :value="control.id">{{ control.title }}</option>
        </select>
        <label v-if="selected">大小 <input type="range" min="30" max="250" :value="layout(selected).scale" @input="resize"> {{ layout(selected).scale }}%</label>
        <button type="button" @click="draft.layout = {}">恢复默认布局</button>
        <button type="button" @click="applySettings">保存布局</button>
      </div>
      <div ref="stage" class="stage" :class="{ editing }">
        <article v-for="index in [0, 1]" :key="index" class="card stick-card" :class="{ selected: selected === 'stick-' + index }"
          :style="style('stick-' + index)" @pointerdown="dragStart($event, 'stick-' + index)"
          @pointermove="dragMove" @pointerup="dragEnd" @lostpointercapture="dragEnd">
          <strong>{{ index === 0 ? "左摇杆" : "右摇杆" }}</strong>
          <div class="stick" :aria-label="index === 0 ? '左摇杆操控区' : '右摇杆操控区'"
            @pointerdown="moveStick($event, index)" @pointermove="moveStick($event, index)"
            @pointerup="releaseStick($event, index)" @pointercancel="releaseStick($event, index)"
            @lostpointercapture="releaseStick($event, index)">
            <span :style="{ left: 50 + axes[index * 2] / 25 + '%', top: 50 - axes[index * 2 + 1] / 25 + '%' }"></span>
          </div>
          <small>X {{ axes[index * 2] }} · Y {{ axes[index * 2 + 1] }} · {{ modes[shown.sticks[index].mode] }}</small>
        </article>
        <article v-for="control of shown.controls" :key="control.id" class="card control-card" :class="{ selected: selected === control.id }"
          :style="style(control.id)" @pointerdown="dragStart($event, control.id)"
          @pointermove="dragMove" @pointerup="dragEnd" @lostpointercapture="dragEnd">
          <label v-if="control.kind === 'slider'">{{ control.title }}
            <input type="range" min="0" :max="shown.sliders[control.channel].stepped ? values(shown.sliders[control.channel].values).length - 1 : 100"
              :value="sliderIndex(control)" :disabled="!editable" @input="assignSlider(control, $event)">
          </label>
          <button v-else type="button" class="control-key" :disabled="!editable"
            @pointerdown="press($event, control)" @pointerup="release($event, control)"
            @pointercancel="release($event, control)" @lostpointercapture="release($event, control)">{{ control.title }}</button>
          <small>通道 {{ control.channel + 1 }} · {{ channels[control.channel] }} <span v-if="control.note"> · {{ control.note }}</span></small>
        </article>
      </div>
    </section>

    <section v-else class="settings" aria-label="功能选项">
      <nav aria-label="设置分类">
        <button v-for="name in sectionNames" :key="name" type="button" :aria-pressed="settings === name" @click="settings = name">{{ name }}</button>
      </nav>
      <div v-if="settings === '连接'" class="settings-section">
        <p>蓝牙模式使用 BT630 的 FFF0 服务、FFF2 写入和 FFF1 通知。局域网调试由电脑上的 rc-tune 通过 SWD 读写。</p>
        <p>离开页面或切换到后台会关闭使能并断开；重新连接后需要手动使能。</p>
        <button type="button" @click="editing = true">编辑布局</button>
      </div>
      <div v-else-if="settings === '摇杆'" class="settings-section">
        <fieldset v-for="(stick, index) of draft.sticks" :key="index">
          <legend>{{ index === 0 ? "左摇杆" : "右摇杆" }}</legend>
          <label>方向<select v-model="stick.mode"><option v-for="(name, key) in modes" :key="key" :value="key">{{ name }}</option></select></label>
          <label>死区（0–30%）<input v-model.number="stick.dead" type="number" min="0" max="30"></label>
          <label>最大值（1–1000）<input v-model.number="stick.max" type="number" min="1" max="1000"></label>
        </fieldset>
      </div>
      <div v-else-if="settings === '滑块'" class="settings-section">
        <fieldset v-for="(slider, index) of draft.sliders" :key="index">
          <legend>通道 {{ index + 1 }}</legend>
          <label>分档 <input v-model="slider.stepped" type="checkbox"></label>
          <label v-if="slider.stepped">档位（逗号分隔）<input v-model="slider.values" placeholder="0,1,2"></label>
          <small v-else>连续输出 0–1000</small>
        </fieldset>
      </div>
      <div v-else-if="settings === '自定义控件'" class="settings-section">
        <fieldset v-for="(control, index) of draft.controls" :key="control.id">
          <legend>控件 {{ index + 1 }}</legend>
          <label>名称<input v-model.trim="control.title" maxlength="24"></label>
          <label>备注<input v-model.trim="control.note" maxlength="40"></label>
          <label>类型<select v-model="control.kind"><option v-for="(name, key) in kinds" :key="key" :value="key">{{ name }}</option></select></label>
          <label>通道<select v-model.number="control.channel"><option v-for="i of 4" :key="i" :value="i - 1">{{ i }}</option></select></label>
          <label v-if="control.kind === 'press' || control.kind === 'short-long'">按下／短按值<input v-model.number="control.short" type="number" min="0" max="1000"></label>
          <label v-if="control.kind === 'short-long'">长按值<input v-model.number="control.long" type="number" min="0" max="1000"></label>
          <label v-if="control.kind === 'cycle'">循环值<input v-model="control.cycle"></label>
          <button type="button" @click="draft.controls.splice(index, 1); delete draft.layout[control.id]">删除控件</button>
        </fieldset>
        <button type="button" @click="draft.controls.push(createControl(draft.controls.length % 4))">添加控件</button>
      </div>
      <div v-else-if="settings === '手柄映射'" class="settings-section">
        <p>{{ padLabel }}。仅支持浏览器识别为标准布局的手柄。</p>
        <fieldset v-for="(binding, index) of draft.bindings" :key="index">
          <legend>{{ padNames[index] }}</legend>
          <label>通道<select v-model.number="binding.channel"><option v-for="i of 4" :key="i" :value="i - 1">{{ i }}</option></select></label>
          <label>输出值<input v-model.number="binding.value" type="number" min="0" max="1000"></label>
        </fieldset>
      </div>
      <div v-else class="settings-section">
        <p>{{ status }} · 已发送 {{ frameCount }} 帧</p>
        <p v-if="detail">{{ detail }}</p>
        <p>最近发送：<code>{{ lastFrame }}</code></p>
        <p>FFF1 通知：<code>{{ received }}</code></p>
        <button v-if="mode === 'lan' && connection === 'ready'" type="button" @click="refreshReadback">回读 g_rc</button>
        <pre v-if="readback">{{ readback }}</pre>
        <small>蓝牙写入完成不代表 STM32 已收到；SWD 回读一致只表示探针读到了写入值。</small>
      </div>
      <footer>
        <span v-if="settingError" role="alert">{{ settingError }}</span>
        <button type="button" @click="draft = defaults(); settingError = ''">恢复默认设置</button>
        <button type="button" class="primary" @click="applySettings">应用设置</button>
      </footer>
    </section>
    <span v-if="editing && settingError" role="alert">{{ settingError }}</span>
  </main>
</template>

<style>
:root{font-family:system-ui,sans-serif;color:#20243a;background:#f1f0fa;color-scheme:light}
*{box-sizing:border-box}
body{margin:0}
.remote{max-width:1040px;margin:auto;padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
.remote header,.connection,.edit-bar,.remote footer,.lan-login{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.remote header h1{margin:0 auto 0 0;font-size:1.35rem}
.remote header{padding-block:8px 16px}
.remote a{color:#5344ae}
.remote button,.remote input:not([type=range]),.remote select{font:inherit;border:1px solid #d9d7e9;border-radius:9px;background:white;color:inherit;padding:8px;min-height:38px;min-width:0}
.remote button{font-weight:600;cursor:pointer}
.remote button:disabled{opacity:.48;cursor:default}
.remote button[aria-pressed=true],.remote .primary{background:#5949b9;color:white;border-color:#5949b9}
.remote button.stop{color:#ab194a;border-color:#e6a9c0}
.remote button.stop[aria-pressed=true]{color:white;background:#a51945;border-color:#a51945}
.remote label{display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap}
.remote input[type=range]{accent-color:#6250c3;max-width:100%;margin:0}
.lan-login input{min-width:min(65vw,230px)!important}
.status{font-size:.92rem;color:#4c456d;min-height:1.3em;overflow-wrap:anywhere}
.stage{container-type:size;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start;height:min(70vh,650px);min-height:285px;margin-top:10px;overflow:auto;padding:4px}
.card{background:white;border:1px solid #e3e0f2;border-radius:14px;padding:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;min-width:0}
.card small{color:#544c69;overflow-wrap:anywhere}
.stick{width:min(100%,clamp(105px,37vh,180px));aspect-ratio:1;position:relative;touch-action:none;user-select:none;background:linear-gradient(90deg,transparent 49.5%,#d5d1f1 50%,transparent 51%),linear-gradient(0deg,#eeebff 49%,#d5d1f1 50%,#eeebff 51%);border:1px solid #d5d1f1;border-radius:14px}
.stick span{position:absolute;width:26%;aspect-ratio:1;background:#6a58ce;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none}
.control-card label{justify-content:center}
.control-key{touch-action:none;user-select:none}
.stage.editing .card{touch-action:none;user-select:none;outline:1px dashed #9283d6;cursor:grab}
.stage.editing .card.selected{outline:2px solid #5949b9}
.edit-bar{font-size:.85rem;padding-block:5px}
.settings nav,.settings-section{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}
.settings-section{background:white;border-radius:14px;padding:12px;align-items:start}
.settings-section p,.settings-section pre{width:100%;margin:5px 0;overflow-wrap:anywhere}
.settings-section fieldset{border:1px solid #ddd8ef;border-radius:9px;display:grid;gap:6px;max-width:100%;min-width:0}
.settings-section input[type=number]{max-width:90px}
.settings-section pre{overflow:auto;white-space:pre-wrap}
.remote [role=alert]{color:#a51945}
</style>
