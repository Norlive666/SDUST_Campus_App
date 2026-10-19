import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { version } from "../../package.json";

export const RELEASES_URL = "https://github.com/Norlive666/SDUST_Campus_App/releases";
export const LATEST_RELEASE_API = "https://api.github.com/repos/Norlive666/SDUST_Campus_App/releases/latest";
export const bundledVersion = import.meta.env.VITE_APP_VERSION || version;

export interface AppUpdate {
  version: string;
  currentVersion: string;
  notes: string;
  releaseUrl: string;
  downloadUrl: string | null;
  assetName: string;
}

function versionParts(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:\+[\w.-]+)?$/.exec(value);
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = versionParts(latest), b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function githubUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password ? url.href : null;
  } catch (_) { return null; }
}

export async function getInstalledVersion(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    // A native build must use its actual installed version, not package.json's version.
    const info = await App.getInfo();
    if (!versionParts(info.version)) throw new Error("无法识别当前应用版本");
    return info.version;
  }
  return bundledVersion;
}

export function parseRelease(release: any, current: string): AppUpdate | null {
  if (!release || typeof release.tag_name !== "string" || !versionParts(release.tag_name) || !Array.isArray(release.assets)) {
    throw new Error("更新信息格式异常");
  }
  if (release.draft || release.prerelease || !isNewerVersion(release.tag_name, current)) return null;
  const extension = ".apk";
  const assets = release.assets.filter((asset: any) =>
    asset && typeof asset.name === "string" && asset.name.toLowerCase().endsWith(extension) &&
    asset.state === "uploaded" && githubUrl(asset.browser_download_url),
  );
  // Prefer a universal APK; do not guess the device ABI when multiple split builds exist.
  const asset = assets.length === 1 ? assets[0] : assets.find((item: any) => /universal/i.test(item.name));
  return {
    version: release.tag_name.replace(/^v/, ""), currentVersion: current,
    notes: typeof release.body === "string" ? release.body.slice(0, 6000) : "",
    releaseUrl: githubUrl(release.html_url) || RELEASES_URL,
    downloadUrl: asset ? githubUrl(asset.browser_download_url) : null,
    assetName: asset?.name || "",
  };
}

export async function checkForUpdate(): Promise<AppUpdate | null> {
  const current = await getInstalledVersion();
  let status: number, data: any;
  // Keep GitHub requests independent of the school session/cookies and never embed a token.
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url: LATEST_RELEASE_API,
      headers: { Accept: "application/vnd.github+json" },
      responseType: "json", connectTimeout: 7000, readTimeout: 7000,
    });
    status = response.status;
    data = status === 200 && typeof response.data === "string" ? JSON.parse(response.data) : response.data;
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: "application/vnd.github+json" },
        credentials: "omit", cache: "no-store", signal: controller.signal,
      });
      status = response.status;
      if (status === 200) data = await response.json();
    } finally { clearTimeout(timer); }
  }
  if (status === 404) return null;
  if (status !== 200) throw new Error("检查更新失败，请稍后重试");
  return parseRelease(data, current);
}

export async function openUpdateUrl(url: string): Promise<void> {
  const safeUrl = githubUrl(url);
  if (!safeUrl) throw new Error("下载链接不可用");
  if (Capacitor.isNativePlatform()) await Browser.open({ url: safeUrl });
  else window.open(safeUrl, "_blank", "noopener,noreferrer");
}
