import { Capacitor, registerPlugin } from "@capacitor/core";
import { reactive } from "vue";
interface State { enabled: boolean; allowed: boolean }
interface NotificationPlugin {
  status(): Promise<State>;
  initialize(): Promise<State>;
  configure(options: { enabled: boolean }): Promise<State>;
  openSettings(): Promise<void>;
  consumeOpen(): Promise<{ open: boolean }>;
}
const native = registerPlugin<NotificationPlugin>("TimetableNotification");
export const supportsTimetableNotification = () => Capacitor.getPlatform() === "android";
export const timetableNotification = reactive({ enabled: true, allowed: false, loaded: false, busy: false });
function apply(state: State) { Object.assign(timetableNotification, state, { loaded: true }); }
let initializing: Promise<void> | undefined;
export async function initializeTimetableNotification() {
  if (!supportsTimetableNotification()) return;
  if (!initializing) initializing = native.initialize().then(apply).finally(() => { initializing = undefined; });
  return initializing;
}
export async function refreshNotificationStatus() {
  if (supportsTimetableNotification()) apply(await native.status());
}
export async function setTimetableNotification(enabled: boolean) {
  if (!supportsTimetableNotification() || timetableNotification.busy) return;
  timetableNotification.busy = true;
  try {
    // Avoid racing a permission callback against a later switch change.
    await initializing;
    apply(await native.configure({ enabled }));
  } finally { timetableNotification.busy = false; }
}
export async function openNotificationSettings() {
  if (supportsTimetableNotification()) await native.openSettings();
}
export async function consumeNotificationOpen() {
  return supportsTimetableNotification() && (await native.consumeOpen()).open;
}
