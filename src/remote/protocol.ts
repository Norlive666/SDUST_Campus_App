// Protocol: https://github.com/Norlive666/remote-control/tree/codex/remote-control/protocol
export type ControlState = {
  axes: number[];
  channels: number[];
  enabled: boolean;
  stopped: boolean;
};
export type Stick = { mode: "free" | "horizontal" | "vertical" | "four-way"; dead: number; max: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mapStick(x: number, y: number, { mode, dead, max }: Stick) {
  const scale = (v: number) => Math.sign(v) * Math.round(clamp((Math.abs(v) - dead * 10) / (1000 - dead * 10), 0, 1) * max);
  if (mode === "four-way") {
    const length = Math.hypot(x, y);
    return Math.abs(x) > Math.abs(y) ? [scale(Math.sign(x) * length), 0] : [0, scale(Math.sign(y) * length)];
  }
  return [mode === "vertical" ? 0 : scale(x), mode === "horizontal" ? 0 : scale(y)];
}

export function encodeFrame(state: ControlState, sequence: number) {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  bytes.set([0xa5, 0x5a, 2, sequence]);
  const enabled = state.enabled && !state.stopped;
  if (enabled) {
    for (let i = 0; i < 4; i++) view.setInt16(4 + i * 2, clamp(Math.round(state.axes[i]), -1000, 1000), true);
    let packed = 0;
    for (let i = 0; i < 4; i++) packed += clamp(Math.round(state.channels[i]), 0, 1000) * 2 ** (10 * i);
    for (let i = 12; i < 17; i++) {
      bytes[i] = packed % 256;
      packed = Math.floor(packed / 256);
    }
  }
  bytes[17] = state.stopped ? 2 : Number(enabled);
  let crc = 0xffff;
  for (const byte of bytes.subarray(2, 18)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  view.setUint16(18, crc, true);
  return bytes;
}

export const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
