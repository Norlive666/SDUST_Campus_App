import { reactive } from "vue";
import { Capacitor } from "@capacitor/core";
export const pwa = reactive({
  web: !Capacitor.isNativePlatform(), online: navigator.onLine,
  ready: false, supported: "serviceWorker" in navigator && window.isSecureContext,
  updateAvailable: false, error: false,
});
let registration: ServiceWorkerRegistration | undefined;
let started = false, refreshing = false;
export async function checkWebUpdate() {
  if (registration) await registration.update();
  pwa.updateAvailable = !!registration?.waiting;
}
export function activateWebUpdate() {
  if (!registration?.waiting) return;
  refreshing = true;
  registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
}
export function startPwa() {
  if (started || !pwa.web) return;
  started = true;
  window.addEventListener("offline", () => { pwa.online = false; });
  window.addEventListener("online", () => {
    pwa.online = true;
    void checkWebUpdate().catch(() => {});
  });
  if (!import.meta.env.PROD || !pwa.supported) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) window.location.reload();
  });
  void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(async reg => {
    registration = reg;
    pwa.updateAvailable = !!reg.waiting;
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) pwa.updateAvailable = true;
      });
    });
    await navigator.serviceWorker.ready;
    pwa.ready = true;
    void checkWebUpdate().catch(() => {});
  }).catch(() => { pwa.error = true; });
}
