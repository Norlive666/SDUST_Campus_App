import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

export function offlineShell(): Plugin {
  return {
    name: "shst-offline-shell",
    apply: "build",
    generateBundle(_, bundle) {
      const publicFiles = ["/logo.svg", "/manifest.webmanifest", "/icons/icon-180.png", "/icons/icon-192.png", "/icons/icon-512.png"];
      const files = [...new Set([...Object.keys(bundle).map(name => `/${name}`), "/index.html", ...publicFiles])];
      const hash = createHash("sha256");
      for (const item of Object.values(bundle)) hash.update(item.type === "chunk" ? item.code : item.source);
      hash.update(readFileSync("index.html"));
      for (const file of publicFiles) hash.update(readFileSync(`public${file}`));
      const template = readFileSync("pwa/sw.template.js", "utf8");
      hash.update(template);
      this.emitFile({ type: "asset", fileName: "sw.js", source: template
        .replace("__CACHE_ID__", hash.digest("hex").slice(0, 16))
        .replace("__PRECACHE__", JSON.stringify(files)) });
    },
  };
}
