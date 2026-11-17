type Characteristic = EventTarget & {
  properties: { write: boolean; writeWithoutResponse: boolean; notify: boolean; indicate: boolean };
  value?: DataView;
  writeValueWithResponse?(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array): Promise<void>;
  writeValue?(value: Uint8Array): Promise<void>;
  startNotifications(): Promise<Characteristic>;
};
type Gatt = {
  connected: boolean;
  connect(): Promise<Gatt>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<Characteristic> }>;
};
export type Device = EventTarget & { id?: string; name?: string; gatt?: Gatt };
type Bluetooth = {
  requestDevice(options: { acceptAllDevices: true; optionalServices: string[] }): Promise<Device>;
  getDevices?(): Promise<Device[]>;
};

export type Link = {
  name: string;
  send(frame: Uint8Array): Promise<string | void>;
  close(): void;
  readState?(): Promise<unknown>;
};

const uuid = (id: string) => `0000${id}-0000-1000-8000-00805f9b34fb`;
const bluetooth = () => (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
export const supportsBluetooth = () => Boolean(bluetooth()?.requestDevice);
export const knownBluetoothDevices = () => bluetooth()?.getDevices?.() ?? Promise.resolve([]);

export function chooseBluetooth() {
  const api = bluetooth();
  if (!api) throw new Error("当前浏览器不支持 Web Bluetooth");
  return api.requestDevice({ acceptAllDevices: true, optionalServices: [uuid("fff0")] });
}

export async function openBluetooth(
  device: Device,
  signal: AbortSignal,
  lost: () => void,
  notified: (bytes: Uint8Array) => void,
): Promise<Link> {
  const gatt = device.gatt;
  if (!gatt) throw new Error("所选设备不支持 BLE GATT");
  let rx: Characteristic | undefined;
  const onValue = () => {
    const value = rx?.value;
    if (value) notified(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  };
  const close = () => {
    device.removeEventListener("gattserverdisconnected", lost);
    rx?.removeEventListener("characteristicvaluechanged", onValue);
    if (gatt.connected) gatt.disconnect();
  };
  try {
    signal.throwIfAborted();
    signal.addEventListener("abort", close, { once: true });
    await gatt.connect();
    signal.throwIfAborted();
    const service = await gatt.getPrimaryService(uuid("fff0"));
    const tx = await service.getCharacteristic(uuid("fff2"));
    const write = (tx.properties.write && tx.writeValueWithResponse)
      || (tx.properties.writeWithoutResponse && tx.writeValueWithoutResponse) || tx.writeValue;
    if ((!tx.properties.write && !tx.properties.writeWithoutResponse) || !write) {
      throw new Error("FFF2 不支持写入");
    }
    rx = await service.getCharacteristic(uuid("fff1")).catch(() => undefined);
    if (rx && (rx.properties.notify || rx.properties.indicate)) {
      rx.addEventListener("characteristicvaluechanged", onValue);
      await rx.startNotifications();
    }
    signal.throwIfAborted();
    if (!gatt.connected) throw new Error("蓝牙在连接时断开");
    device.addEventListener("gattserverdisconnected", lost);
    return {
      name: device.name || "BT630",
      async send(frame) { await write.call(tx, frame); },
      close,
    };
  } catch (error) {
    close();
    throw error;
  } finally {
    signal.removeEventListener("abort", close);
  }
}

export async function openDebug(token: string, signal: AbortSignal): Promise<Link> {
  if (!document.querySelector('meta[name="rc-tune-bridge"]')) throw new Error("请先打开电脑提供的局域网调试页");
  if (!token.trim()) throw new Error("请填写电脑显示的网页调试令牌");
  async function request(path: string, frame?: Uint8Array) {
    const timer = new AbortController();
    const timeout = window.setTimeout(() => timer.abort(), frame ? 240 : 1500);
    if (signal.aborted) timer.abort();
    const abort = () => timer.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(`/rc-tune/${path}`, {
        method: frame ? "POST" : "GET",
        headers: { "X-Token": token.trim(), ...(frame ? { "Content-Type": "application/octet-stream" } : {}) },
        body: frame as BodyInit | undefined,
        cache: "no-store",
        credentials: "omit",
        signal: timer.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      return result;
    } finally {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
  }
  const health = await request("health");
  signal.throwIfAborted();
  if (!health.write_enabled) throw new Error("rc-tune 处于只读模式");
  return {
    name: `${health.symbol || "g_rc"} @ 0x${Number(health.address).toString(16).toUpperCase()}`,
    async send(frame) {
      const result = await request("frame", frame);
      if (!result.verified) throw new Error(result.error || "停发：探针回读不一致");
      return `回读一致 · ${result.ms ?? "—"} ms`;
    },
    close() {},
    readState: () => request("state"),
  };
}
