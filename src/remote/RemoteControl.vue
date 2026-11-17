<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue";
import { Bluetooth, CircleGauge, Gamepad2, Link2, Settings, SlidersHorizontal, X, LayoutGrid } from "lucide-vue-next";
import { clamp, hex, mapStick } from "./protocol";
import type { Stick } from "./protocol";
import { chooseBluetooth, knownBluetoothDevices, openBluetooth, openDebug, supportsBluetooth } from "./links";
import type { Device, Link } from "./links";
import { startSession } from "./session";

type Control = { id: string; title: string; note: string; channel: number; kind: "slider" | "press" | "short-long" | "cycle"; short: number; long: number; cycle: string };
type Layout = { x: number; y: number; scale: number };
type Box = { x: number; y: number; width: number; height: number };
const KEY = "sdust-remote-settings-v1";
const DEVICE_KEY = "sdust-remote-bt630";
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
const canvas = reactive({ width: 800, height: 360 });
watch(stage, (element, _, cleanup) => {
  if (!element) return;
  const observer = new ResizeObserver(([entry]) => Object.assign(canvas, {
    width: entry.contentRect.width, height: entry.contentRect.height,
  }));
  observer.observe(element);
  cleanup(() => observer.disconnect());
});
const settingError = ref("");
const sections = [
  { label: "连接与后台", icon: Link2 }, { label: "摇杆参数", icon: Gamepad2 },
  { label: "滑块档位", icon: SlidersHorizontal }, { label: "自定义控件", icon: LayoutGrid },
  { label: "手柄映射", icon: Gamepad2 }, { label: "通信诊断", icon: CircleGauge },
];
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
const remembered = shallowRef<Device>();
let holdTimer: number | undefined;
let heldConnection = false;
let picking = false;
let retryTimer = 0;
let retry = 0;
let activeLink: Link | undefined;
let session: ReturnType<typeof startSession> | undefined;
let drag: { key: string; pointer: number; x: number; y: number; from: Layout } | undefined;
const shown = computed(() => editing.value ? draft.value : config.value);
const editable = computed(() => !settings.value && !editing.value && !stopped.value);

if (hasBluetooth) void knownBluetoothDevices().then(devices => {
  const id = localStorage.getItem(DEVICE_KEY);
  if (!remembered.value && id) remembered.value = devices.find(device => device.id === id);
}).catch(() => {});

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

function retryBluetooth(run: number, reason: unknown) {
  if (run !== generation) return;
  failed(run, reason);
  if (!remembered.value || retry >= 5 || document.hidden) return;
  const delay = Math.min(1000 * 2 ** retry++, 5000);
  status.value = `蓝牙已断开 · ${delay / 1000} 秒后重试`;
  connection.value = "connecting";
  retryTimer = window.setTimeout(() => {
    connection.value = "idle";
    void connect(true);
  }, delay);
}

async function connect(reconnecting = false) {
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
      const device = remembered.value;
      if (!device) throw new Error("请先选择蓝牙设备");
      link = await openBluetooth(device, abort.signal,
        () => retryBluetooth(current, "蓝牙已断开，重连后需手动使能"),
        bytes => { if (current === generation) received.value = hex(bytes); });
    } else link = await openDebug(token.value, abort.signal);
    if (current !== generation || document.hidden) {
      link.close();
      if (current === generation) await disconnect();
      return;
    }
    activeLink = link;
    status.value = "正在验证第一帧";
    session = startSession(link, () => ({ axes, channels, enabled: enabled.value, stopped: stopped.value }), {
      sent(frame, note) {
        if (current !== generation) return;
        if (connection.value !== "ready") {
          status.value = `已连接 · ${link.name}`;
          connection.value = "ready";
          if (mode.value === "ble" && remembered.value?.id) {
            try { localStorage.setItem(DEVICE_KEY, remembered.value.id); } catch { /* optional persistence */ }
          }
        }
        lastFrame.value = hex(frame);
        frameCount.value++;
        if (frameCount.value === 500) retry = 0;
        if (note) detail.value = note;
      },
      failed: error => mode.value === "ble" ? retryBluetooth(current, error) : failed(current, error),
    });
  } catch (error) {
    if (current === generation) {
      if (mode.value === "ble" && remembered.value) {
        retryBluetooth(current, error);
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
async function pickDevice() {
  if (!hasBluetooth || picking || editing.value || mode.value !== "ble") return;
  picking = true;
  disarm();
  try {
    const device = await chooseBluetooth();
    if (mode.value !== "ble" || editing.value) return;
    await disconnect();
    remembered.value = device;
    await connect();
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) {
      detail.value = error instanceof Error ? error.message : String(error);
    }
  } finally { picking = false; }
}
function startHold(event: PointerEvent) {
  heldConnection = false;
  if (event.button !== 0 || mode.value !== "ble" || !hasBluetooth || editing.value) return;
  holdTimer = window.setTimeout(() => { heldConnection = true; }, 500);
}
function clearHold() { window.clearTimeout(holdTimer); }
function clickConnection(event: MouseEvent) {
  if (heldConnection && event.detail !== 0) { heldConnection = false; void pickDevice(); return; }
  if (connection.value !== "idle") { void disconnect(); return; }
  if (mode.value === "ble" && hasBluetooth) {
    if (remembered.value) void connect();
    else void pickDevice();
    return;
  }
  if (mode.value === "lan" && local && token.value.trim()) { void connect(); return; }
  openSettings("连接与后台");
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
  clearHold();
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
  assign(control.channel, slider.stepped ? values(slider.values)[raw] : raw);
}
function sliderIndex(control: Control) {
  const slider = shown.value.sliders[control.channel];
  return slider.stepped ? Math.max(0, values(slider.values).indexOf(channels[control.channel])) : channels[control.channel];
}
function centerSlider(control: Control) {
  const slider = shown.value.sliders[control.channel];
  const steps = values(slider.values);
  assign(control.channel, slider.stepped ? steps[Math.round((steps.length - 1) / 2)] : 500);
}
function cycleStickMode(index: number) {
  const options = Object.keys(modes) as Stick["mode"][];
  const stick = config.value.sticks[index];
  stick.mode = options[(options.indexOf(stick.mode) + 1) % options.length];
  pointer.delete(index);
  axes.splice(index * 2, 2, 0, 0);
  saveConfig();
}
function thumbOffset(index: number, axis: number) {
  return 50 + axes[index * 2 + axis] / shown.value.sticks[index].max * (axis === 0 ? 36 : -36);
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

function openSettings(section = "摇杆参数") {
  disarm();
  draft.value = JSON.parse(JSON.stringify(config.value));
  settings.value = section;
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
  saveConfig();
  closeSettings();
}
function saveConfig() {
  try { localStorage.setItem(KEY, JSON.stringify(config.value)); } catch { /* optional persistence */ }
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
const extraHeight = computed(() => Math.ceil(Math.max(0, shown.value.controls.length - 2) / (canvas.width >= 600 ? 3 : 2)) * 74);
function baseBox(key: string): Box {
  const { width } = canvas;
  const height = canvas.height - extraHeight.value;
  const wide = width >= 600;
  const gap = wide ? 12 : 8;
  const optionsWidth = wide ? 108 : 86;
  const sliderWidth = (width - optionsWidth - 2 * gap) / 2;
  const sliderHeight = shown.value.controls.slice(0, 2).some(control => control.note) ? 67 : 55;
  const top = sliderHeight + 9;
  const columnWidth = (width - (wide ? 2 : 1) * gap) / (wide ? 3 : 2);
  const joystickHeight = wide ? (height - top) * .8 : height - top - 137;
  if (key === "hub") return wide
    ? { x: columnWidth + gap, y: top + Math.max(46, (height - top - 110) / 2), width: columnWidth, height: 110 }
    : { x: 0, y: top + joystickHeight + gap, width, height: 110 };
  if (key === "stick-0" || key === "stick-1") return {
    x: key === "stick-0" ? 0 : width - columnWidth, y: top, width: columnWidth, height: joystickHeight,
  };
  if (key === "pad-0" || key === "pad-1") {
    const card = position(`stick-${key.slice(-1)}`);
    const side = Math.max(1, Math.min(card.width - 18, card.height - 56, 240) * .78);
    return { x: card.x + (card.width - side) / 2, y: card.y + (card.height - side) / 2 - 4, width: side, height: side };
  }
  const index = shown.value.controls.findIndex(control => control.id === key);
  if (index < 2) return { x: index === 0 ? 0 : width - sliderWidth, y: 0, width: sliderWidth, height: sliderHeight };
  const columns = wide ? 3 : 2;
  return { x: (index - 2) % columns * (columnWidth + gap), y: height + Math.floor((index - 2) / columns) * 74,
    width: columnWidth, height: 64 };
}
function position(key: string) {
  const base = baseBox(key);
  const saved = layout(key);
  const scale = Math.min(saved.scale / 100, canvas.width / base.width, canvas.height / base.height);
  const width = base.width * scale;
  const height = base.height * scale;
  return { base, width, height, scale,
    x: clamp(base.x + saved.x * canvas.width / 100, 0, canvas.width - width),
    y: clamp(base.y + saved.y * canvas.height / 100, 0, canvas.height - height) };
}
function style(key: string) {
  const { base, scale, x, y } = position(key);
  return { width: `${base.width}px`, height: `${base.height}px`,
    left: `${x}px`, top: `${y}px`, transform: `scale(${scale})` };
}
function dragStart(event: PointerEvent, key: string) {
  if (!editing.value || drag) return;
  selected.value = key;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  const { base, x, y } = position(key);
  const from = { scale: layout(key).scale, x: (x - base.x) / canvas.width * 100, y: (y - base.y) / canvas.height * 100 };
  drag = { key, pointer: event.pointerId, x: event.clientX, y: event.clientY, from };
}
function dragMove(event: PointerEvent) {
  if (!drag || drag.pointer !== event.pointerId || !stage.value) return;
  draft.value.layout[drag.key] = {
    ...drag.from,
    x: clamp(drag.from.x + (event.clientX - drag.x) / canvas.width * 100, -100, 100),
    y: clamp(drag.from.y + (event.clientY - drag.y) / canvas.height * 100, -100, 100),
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
    <header class="page-header">
      <a v-if="!local" href="/timetable">‹ 课表</a>
      <h1>遥控器</h1>
    </header>

    <section v-if="!settings || editing" aria-label="控制面板">
      <div ref="stage" class="stage" :class="{ editing }" :style="{ '--extra-height': extraHeight + 'px' }">
        <button type="button" class="options" :disabled="editing" @click="openSettings()">
          <SlidersHorizontal aria-hidden="true" />功能选项
        </button>
        <h2 class="panel-title">{{ editing ? "编辑布局" : "操控面板" }}</h2>
        <article v-for="index in [0, 1]" :key="'stick-' + index" class="card stick-card"
          :class="{ selected: selected === 'stick-' + index }" :style="style('stick-' + index)"
          @pointerdown="dragStart($event, 'stick-' + index)" @pointermove="dragMove" @pointerup="dragEnd"
          @pointercancel="dragEnd" @lostpointercapture="dragEnd">
          <div class="card-row">
            <strong>{{ index === 0 ? "左摇杆" : "右摇杆" }}</strong>
            <span class="readout">X {{ axes[index * 2] }}　Y {{ axes[index * 2 + 1] }}</span>
          </div>
          <div class="card-row stick-footer">
            <small>死区 {{ shown.sticks[index].dead }}% · ±{{ shown.sticks[index].max }}</small>
            <button type="button" :disabled="!editable" @click="cycleStickMode(index)"
              :aria-label="(index === 0 ? '左摇杆方向：' : '右摇杆方向：') + modes[shown.sticks[index].mode]">{{ modes[shown.sticks[index].mode] }}</button>
          </div>
        </article>
        <div v-for="index in [0, 1]" :key="'pad-' + index" class="stick"
          :class="{ selected: selected === 'pad-' + index }" :style="style('pad-' + index)"
          :aria-label="index === 0 ? '左摇杆操控区' : '右摇杆操控区'"
          @pointerdown="editing ? dragStart($event, 'pad-' + index) : moveStick($event, index)"
          @pointermove="editing ? dragMove($event) : moveStick($event, index)"
          @pointerup="editing ? dragEnd($event) : releaseStick($event, index)"
          @pointercancel="editing ? dragEnd($event) : releaseStick($event, index)"
          @lostpointercapture="editing ? dragEnd($event) : releaseStick($event, index)">
          <span :style="{ left: thumbOffset(index, 0) + '%', top: thumbOffset(index, 1) + '%' }"></span>
        </div>
        <article class="card hub" :class="{ selected: selected === 'hub' }" :style="style('hub')"
          @pointerdown="dragStart($event, 'hub')" @pointermove="dragMove" @pointerup="dragEnd"
          @pointercancel="dragEnd" @lostpointercapture="dragEnd">
          <button type="button" class="connect" :aria-label="connection === 'idle' ? '连接' : connection === 'connecting' ? '取消连接' : '断开'"
            :disabled="connection === 'closing' || editing"
            @pointerdown="startHold" @pointerup="clearHold" @pointercancel="clearHold" @pointerleave="clearHold"
            @contextmenu.prevent @click="clickConnection">
            <Bluetooth v-if="mode === 'ble'" aria-hidden="true" /><Link2 v-else aria-hidden="true" />
            <span><strong>{{ mode === "ble" ? remembered?.name || "FSC-BT630" : "局域网调试" }}</strong>
              <small v-if="mode === 'ble'">{{ connection === "ready" ? "短按断开 · 长按选设备" : connection === "connecting" ? "短按取消 · 长按选设备" : remembered ? "短按连接 · 长按选设备" : "短按或长按选择设备" }}</small>
              <small v-else>{{ connection === "ready" ? "点击断开" : connection === "connecting" ? "点击取消" : "点击连接" }}</small>
            </span>
          </button>
          <p role="status" class="status" :title="[status, detail].filter(Boolean).join(' · ')">{{ editing ? "使能已关闭" : status }}<span v-if="detail && !editing"> · {{ detail }}</span></p>
          <div class="card-row hub-footer">
            <button type="button" class="enable" role="switch" aria-label="使能" :aria-checked="enabled"
              :disabled="connection !== 'ready' || editing" @click="toggleEnable"><i aria-hidden="true"></i><span>使能</span></button>
            <small>50 Hz</small>
          </div>
        </article>
        <article v-for="control of shown.controls" :key="control.id" class="card control-card"
          :class="{ selected: selected === control.id }" :style="style(control.id)"
          @pointerdown="dragStart($event, control.id)" @pointermove="dragMove" @pointerup="dragEnd"
          @pointercancel="dragEnd" @lostpointercapture="dragEnd">
          <template v-if="control.kind === 'slider'">
            <div class="card-row">
              <strong>{{ control.title }}</strong>
              <div class="slider-value"><span class="readout">{{ channels[control.channel] }}</span>
                <button type="button" :disabled="!editable" @click="centerSlider(control)">{{ shown.sliders[control.channel].stepped ? "中档" : "50%" }}</button>
              </div>
            </div>
            <div class="slider-field">
              <input type="range" min="0" :max="shown.sliders[control.channel].stepped ? values(shown.sliders[control.channel].values).length - 1 : 1000"
                :aria-label="control.title" :value="sliderIndex(control)" :disabled="!editable" @input="assignSlider(control, $event)">
              <div v-if="shown.sliders[control.channel].stepped" class="ticks" aria-hidden="true">
                <i v-for="n in values(shown.sliders[control.channel].values).length" :key="n"></i>
              </div>
            </div>
          </template>
          <button v-else type="button" class="control-key" :aria-label="control.title" :disabled="!editable"
            @pointerdown="press($event, control)" @pointerup="release($event, control)"
            @pointercancel="release($event, control)" @lostpointercapture="release($event, control)">{{ control.title }} · {{ channels[control.channel] }}</button>
          <small v-if="control.note" class="control-note">{{ control.note }}</small>
        </article>
      </div>
      <div v-if="editing" class="edit-bar">
        <select v-model="selected" aria-label="选中控件">
          <option value="pad-0">左蓝色摇杆</option><option value="pad-1">右蓝色摇杆</option>
          <option value="stick-0">左摇杆卡片</option><option value="stick-1">右摇杆卡片</option>
          <option value="hub">蓝牙卡片</option>
          <option v-for="control in shown.controls" :key="control.id" :value="control.id">{{ control.title }}</option>
        </select>
        <label>大小 <input type="range" min="30" max="250" :value="layout(selected).scale" @input="resize"> {{ layout(selected).scale }}%</label>
        <button type="button" @click="draft.layout = {}">恢复默认布局</button>
        <button type="button" @click="closeSettings">取消</button>
        <button type="button" class="primary" @click="applySettings">保存布局</button>
      </div>
    </section>

    <section v-else class="settings" aria-label="面板设置">
      <div class="settings-header">
        <Settings aria-hidden="true" /><h2>面板设置</h2>
        <button type="button" @click="selected = 'pad-0'; editing = true">编辑布局</button>
        <button type="button" class="settings-close" aria-label="关闭设置" @click="closeSettings"><X aria-hidden="true" /></button>
      </div>
      <nav aria-label="设置分类">
        <button v-for="item in sections" :key="item.label" type="button" :aria-pressed="settings === item.label"
          @click="settings = item.label"><component :is="item.icon" aria-hidden="true" />{{ item.label }}</button>
      </nav>
      <div class="settings-scroll">
        <h3>{{ settings }}</h3>
        <div v-if="settings === '连接与后台'" class="settings-section">
          <fieldset>
            <legend>调试链路</legend>
            <label>连接方式
              <select v-model="mode" :disabled="connection !== 'idle'">
                <option value="ble">BT630 蓝牙</option>
                <option value="lan">局域网调试</option>
              </select>
            </label>
            <template v-if="mode === 'ble'">
              <button v-if="hasBluetooth" type="button" @click="pickDevice">选择蓝牙设备</button>
              <template v-else>
                <p>请用支持 Web Bluetooth 的浏览器打开。iPhone 可使用 <a href="https://apps.apple.com/app/id1492822055" rel="noreferrer">Bluefy</a>。</p>
                <input :value="pageUrl" readonly aria-label="遥控页地址" @focus="($event.target as HTMLInputElement).select()">
              </template>
            </template>
            <template v-else-if="local">
              <label>网页调试令牌<input v-model="token" type="password" autocomplete="off" :disabled="connection !== 'idle'" placeholder="电脑启动网页调试时显示"></label>
              <button type="button" :disabled="connection === 'closing'" @click="connection === 'idle' ? connect() : disconnect()">
                {{ connection === "idle" ? "连接" : connection === "connecting" ? "取消连接" : "断开" }}
              </button>
            </template>
            <form v-else class="lan-login" @submit.prevent="setLanUrl">
              <label>电脑的局域网调试地址<input v-model="lanUrl" type="url" placeholder="http://192.168.1.10:8766" required></label>
              <button type="submit">打开调试页</button>
              <span v-if="lanUrlError" role="alert">{{ lanUrlError }}</span>
            </form>
            <p v-if="detail">{{ status }} · {{ detail }}</p>
          </fieldset>
          <p class="settings-hint">网页切到后台时会断开。返回后可重新连接，连接成功后需手动使能。</p>
        </div>
      <div v-else-if="settings === '摇杆参数'" class="settings-section">
        <fieldset v-for="(stick, index) of draft.sticks" :key="index">
          <legend>{{ index === 0 ? "左摇杆" : "右摇杆" }}</legend>
          <label>方向<select v-model="stick.mode"><option v-for="(name, key) in modes" :key="key" :value="key">{{ name }}</option></select></label>
          <label>死区 {{ stick.dead }}%<input v-model.number="stick.dead" type="range" min="0" max="30"></label>
          <label>最大值（1–1000）<input v-model.number="stick.max" type="number" min="1" max="1000"></label>
        </fieldset>
      </div>
      <div v-else-if="settings === '滑块档位'" class="settings-section">
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
      </div>
      <footer>
        <span v-if="settingError" role="alert">{{ settingError }}</span>
        <span v-else class="settings-hint">未应用的修改不会保存</span>
        <button type="button" @click="draft = defaults(); settingError = ''">恢复默认设置</button>
        <button type="button" class="primary" @click="applySettings">应用设置</button>
      </footer>
    </section>
    <span v-if="editing && settingError" role="alert">{{ settingError }}</span>
  </main>
</template>

<style>
:root {
  font-family: system-ui, sans-serif;
  color: #1e293b;
  background: #f4f7fb;
  color-scheme: light;
  --accent: #0288d1;
  --muted: #64748b;
  --line: #e6edf5;
  --pad: #e9f1fa;
}
* { box-sizing: border-box; }
body { margin: 0; }
.remote {
  max-width: 1400px;
  margin: auto;
  padding: env(safe-area-inset-top) max(10px, env(safe-area-inset-right))
    max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
}
.remote a { color: var(--accent); }
.remote button, .remote input:not([type=range]), .remote select {
  font: inherit;
  color: inherit;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  min-width: 0;
  min-height: 34px;
  padding: 5px 9px;
}
.remote button { font-weight: 600; cursor: pointer; }
.remote button:disabled { opacity: .5; cursor: default; }
.remote .primary { color: white; background: var(--accent); border-color: var(--accent); }
.remote label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.remote input[type=range] { max-width: 100%; margin: 0; accent-color: var(--accent); }

.page-header { display: flex; align-items: center; gap: 10px; min-height: 34px; }
.page-header h1 { margin: 0; font-size: .86rem; font-weight: 600; }
.page-header a { font-size: .8rem; text-decoration: none; }
.page-header h1, .panel-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.stage {
  --panel-height: max(300px, calc(100dvh - 46px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
  position: relative;
  isolation: isolate;
  height: calc(var(--panel-height) + var(--extra-height, 0px));
  overflow: hidden;
}
.stage.editing { --panel-height: max(300px, calc(100dvh - 105px - env(safe-area-inset-top) - env(safe-area-inset-bottom))); }
.stage > .options {
  position: absolute;
  z-index: 6;
  left: 50%;
  top: 6px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 108px;
  height: 44px;
  padding: 4px;
  border-radius: 16px;
  border-color: #7b8794;
  white-space: nowrap;
  font-size: .79rem;
}
.options svg { width: 15px; color: var(--accent); }
.panel-title {
  position: absolute;
  left: 34%;
  right: 34%;
  top: 72px;
  margin: 0;
  text-align: center;
  font-size: 1.1rem;
}
.stage .card, .stage .stick { position: absolute; transform-origin: top left; }
.card {
  min-width: 0;
  background: white;
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 1px 3px #1e293b26;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}
.card-row { display: flex; justify-content: space-between; align-items: center; min-width: 0; gap: 4px; }
.card-row strong, .control-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-row strong { font-size: .79rem; }
.card .readout { color: var(--muted); font: .72rem ui-monospace, monospace; white-space: nowrap; }
.card small { color: var(--muted); font-size: .66rem; }
.stick-card { justify-content: space-between; }
.stick-footer { align-items: end; }
.stick-footer button { min-height: 30px; border-radius: 16px; color: var(--accent); font-size: .67rem; white-space: nowrap; }
.stick {
  touch-action: none;
  user-select: none;
  z-index: 2;
  border: 1px solid #dae6f2;
  border-radius: 16%;
  background:
    linear-gradient(90deg, transparent 49.6%, #d8e3ed 50%, transparent 50.4%),
    linear-gradient(0deg, transparent 49.6%, #d8e3ed 50%, transparent 50.4%), var(--pad);
}
.stick::before { content: ""; position: absolute; inset: 16%; border: 1px solid #e3edf6; border-radius: 16%; pointer-events: none; }
.stick span {
  position: absolute;
  width: 29%;
  aspect-ratio: 1;
  background: radial-gradient(circle at 34% 28%, #00b4ed, #0288d1 57%, #0369aa 95%);
  border: 3px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.hub, .control-card { z-index: 3; }
.hub { justify-content: space-between; }
.hub .connect {
  width: 100%;
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  text-align: left;
  padding: 3px 7px;
  border: 0;
  border-radius: 14px;
  background: #dff4fd;
  user-select: none;
  touch-action: manipulation;
}
.connect svg { width: 19px; flex: none; color: var(--accent); }
.connect span { min-width: 0; }
.connect strong, .connect small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.connect strong { font-size: .82rem; }
.status {
  color: var(--muted);
  font-size: .7rem;
  margin: 0;
  text-align: center;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
.hub-footer { border-top: 1px solid var(--line); }
.hub-footer .enable { display: inline-flex; gap: 4px; align-items: center; border: none; font-size: .72rem; padding: 0; }
.enable i { display: inline-flex; align-items: center; width: 42px; height: 25px; padding: 3px; border: 1px solid #c9d3de; background: #f1f5f9; border-radius: 20px; }
.enable i::before { content: ""; width: 17px; height: 17px; border-radius: 50%; background: #94a3b8; }
.enable[aria-checked=true] i { justify-content: end; background: var(--accent); border-color: var(--accent); }
.enable[aria-checked=true] i::before { background: white; }
.hub-footer small { font-family: ui-monospace, monospace; }
.control-card { padding: 4px 9px; justify-content: center; gap: 1px; }
.slider-value { display: flex; gap: 3px; align-items: center; white-space: nowrap; }
.slider-value .readout { color: var(--accent); font-weight: 700; }
.slider-value button { min-height: 23px; font-size: .65rem; color: var(--muted); border: none; padding: 1px 4px; }
.slider-field { position: relative; height: 24px; }
.slider-field input {
  position: relative;
  appearance: none;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  background: transparent;
  cursor: pointer;
}
.slider-field::before { content: ""; position: absolute; inset: 5px 9px; border-radius: 10px; background: var(--pad); }
.slider-field input::-webkit-slider-thumb { appearance: none; width: 20px; height: 20px; border: 3px solid white; background: var(--accent); border-radius: 50%; }
.slider-field input::-moz-range-thumb { width: 14px; height: 14px; border: 3px solid white; background: var(--accent); border-radius: 50%; }
.slider-field input:disabled { opacity: .52; }
.ticks { position: absolute; inset: 0 9px; display: flex; align-items: center; justify-content: space-between; pointer-events: none; }
.ticks i { width: 2px; height: 6px; background: white; }
.control-card:has(.control-note) { padding-block: 2px; }
.control-card .control-key { min-height: 30px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; touch-action: none; user-select: none; background: var(--pad); border: 0; font-size: .74rem; }
.control-note { line-height: 1.15; }
.stage.editing .card, .stage.editing .stick { touch-action: none; user-select: none; outline: 1px dashed #8ebad3; cursor: grab; }
.stage.editing .selected { z-index: 5; outline: 2px solid var(--accent); }
.stage.editing .card > * { pointer-events: none; }
.edit-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 5px; margin-top: 6px; padding: 5px 8px; background: white; border: 1px solid var(--line); border-radius: 12px; font-size: .75rem; }
.edit-bar label { flex: 1; min-width: 130px; }
.edit-bar input[type=range] { flex: 1; min-width: 45px; }

.settings {
  display: grid;
  grid-template: auto minmax(0, 1fr) auto / clamp(128px, 22vw, 172px) minmax(0, 1fr);
  height: max(260px, calc(100dvh - 46px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
  background: white;
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
}
.settings-header { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--line); }
.settings-header h2 { flex: 1; font-size: 1.1rem; margin: 0; }
.settings-header svg { width: 19px; }
.settings-header .settings-close { display: grid; place-items: center; min-width: 34px; padding: 2px; border-color: transparent; }
.settings nav { display: flex; flex-direction: column; gap: 4px; padding: 7px; border-right: 1px solid var(--line); overflow: auto; }
.settings nav button { display: flex; gap: 6px; align-items: center; text-align: left; border-color: transparent; white-space: nowrap; font-size: .83rem; }
.settings nav button[aria-pressed=true] { color: var(--accent); background: #e3f3ff; }
.settings nav svg { width: 17px; height: 17px; flex: none; }
.settings-scroll { min-width: 0; background: #f4f7fb; padding: 10px; overflow: auto; }
.settings-scroll h3 { margin: 0 0 8px; font-size: 1rem; }
.settings-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 8px; align-items: start; font-size: .81rem; }
.settings-section fieldset { min-width: 0; display: grid; gap: 7px; margin: 0; padding: 8px; background: white; border: 1px solid var(--line); border-radius: 12px; }
.settings-section legend { font-weight: 700; }
.settings-section input[type=number] { max-width: 90px; }
.settings-section label input, .settings-section label select { max-width: 100%; }
.settings-section p, .settings-section pre, .settings-section > small { grid-column: 1 / -1; margin: 4px 0; overflow-wrap: anywhere; }
.settings-section pre { max-width: 100%; overflow: auto; white-space: pre-wrap; }
.settings footer { grid-column: 2; display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 5px; padding: 6px 8px; border-top: 1px solid var(--line); font-size: .75rem; }
.settings footer span { flex: 1; }
.settings-hint { color: var(--muted); }
.remote [role=alert] { color: #b42338; }
.lan-login { display: grid; gap: 6px; }
@media (max-width: 619px) {
  .stage { --panel-height: max(395px, calc(min(78dvh, 620px) - env(safe-area-inset-top))); }
  .stage.editing { --panel-height: max(395px, calc(min(74dvh, 580px) - env(safe-area-inset-top))); }
  .stage > .options { width: 86px; font-size: .73rem; }
  .panel-title { display: none; }
  .settings { grid-template: auto auto minmax(0, 1fr) auto / minmax(0, 1fr); }
  .settings nav { flex-direction: row; border: 0; border-bottom: 1px solid var(--line); }
  .settings footer { grid-column: 1; }
}
</style>
