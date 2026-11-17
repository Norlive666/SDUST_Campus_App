import { encodeFrame } from "./protocol";
import type { ControlState } from "./protocol";
import type { Link } from "./links";

// The receiver stops after 300 ms. Never resume an armed stream across that gap.
const MAX_GAP = 260;
export function startSession(link: Link, state: () => ControlState, callbacks: {
  sent: (frame: Uint8Array, note?: string) => void;
  failed: (error: unknown) => void;
}) {
  let running = true;
  let sequence = 0;
  let lastSent = performance.now();
  let next: ReturnType<typeof setTimeout>;
  let pending: Promise<void> | undefined;

  function send(frame: Uint8Array) {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      link.send(frame),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("发送超时，已停发")), MAX_GAP);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  async function step() {
    if (!running) return;
    try {
      if (performance.now() - lastSent >= MAX_GAP) throw new Error("控制更新超时，已停发");
      const frame = encodeFrame(state(), sequence++);
      const note = await send(frame);
      if (!running) return;
      if (performance.now() - lastSent >= MAX_GAP) throw new Error("控制更新超时，已停发");
      lastSent = performance.now();
      callbacks.sent(frame, note || undefined);
      next = setTimeout(() => { pending = step(); }, 20);
    } catch (error) {
      if (!running) return;
      running = false;
      link.close();
      callbacks.failed(error);
    }
  }

  pending = step();
  return {
    cancel() {
      running = false;
      clearTimeout(next);
      link.close();
    },
    async stop() {
      if (!running) return;
      running = false;
      clearTimeout(next);
      try {
        await pending;
        await send(encodeFrame({ axes: [], channels: [], enabled: false, stopped: true }, sequence++));
      } catch {
        // Transport can already be gone; the receiver/rc-tune watchdog is authoritative.
      } finally {
        link.close();
      }
    },
  };
}
