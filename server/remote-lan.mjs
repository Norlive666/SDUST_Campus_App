import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isIPv4 } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const endpoints = {
  "/rc-tune/health": ["GET", "health"],
  "/rc-tune/state": ["GET", "state"],
  "/rc-tune/frame": ["POST", "frame"],
};
const mime = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8" };
const status = (res, code, error) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error }));
};

export function makeRemoteLan({ dist = "dist", secret, upstreamPort = 8765, upstreamToken, tls }) {
  const expected = Buffer.from(secret);
  let writing = false;

  async function handle(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const path = req.url.split("?")[0];
    const endpoint = Object.hasOwn(endpoints, path) && endpoints[path];
    if (endpoint) {
      const [method, route] = endpoint;
      if (req.method !== method) return status(res, 405, "不支持此请求方法");
      const sent = Buffer.from(req.headers["x-token"] || "");
      const origin = `${tls ? "https" : "http"}://${req.headers.host}`;
      if ((req.headers.origin && req.headers.origin !== origin)
        || (method === "POST" && !req.headers.origin)
        || req.headers["sec-fetch-site"] === "cross-site") return status(res, 403, "只接受来自本页的请求");
      if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) return status(res, 401, "网页调试令牌不正确");
      const isFrame = route === "frame";
      let body;
      if (isFrame) {
        if (req.headers["content-length"] !== "20" || req.headers["content-type"] !== "application/octet-stream") {
          return status(res, 400, "控制帧必须是 20 字节二进制数据");
        }
        if (writing) return status(res, 409, "上一帧未完成，已拒绝并发写入");
        writing = true;
      }
      try {
        if (isFrame) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          body = Buffer.concat(chunks);
          if (body.length !== 20) return status(res, 400, "控制帧必须是 20 字节");
        }
        const result = await fetch(`http://127.0.0.1:${upstreamPort}/api/${route}`, {
          method,
          headers: {
            ...(upstreamToken ? { "X-Token": upstreamToken } : {}),
            ...(isFrame ? { "Content-Type": "application/octet-stream" } : {}),
          },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(isFrame ? 220 : 1300),
        });
        const payload = await result.text();
        res.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(payload);
      } catch {
        if (!res.destroyed) status(res, 502, "rc-tune 未响应，请确认 VS Code 调试链路正在运行");
      } finally {
        if (isFrame) writing = false;
      }
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") return status(res, 405, "不支持此请求方法");
    if (path === "/") {
      res.writeHead(302, { Location: "/remote-control.html" });
      return res.end();
    }
    const isPage = path === "/remote-control.html";
    const ext = /^\/assets\/[\w.-]+\.(js|css)$/.exec(path)?.[1];
    if (!isPage && !ext) return status(res, 404, "页面不存在");
    let bytes;
    try {
      bytes = await readFile(resolve(dist, `.${path}`), isPage ? "utf8" : undefined);
    } catch {
      return status(res, 404, "文件不存在，请先构建网页");
    }
    if (isPage) bytes = bytes.replace("</head>", '<meta name="rc-tune-bridge" content="1"></head>');
    res.writeHead(200, {
      "Content-Type": isPage ? "text/html; charset=utf-8" : mime[ext],
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  }

  const server = tls ? createHttpsServer(tls, handle) : createServer(handle);
  server.requestTimeout = 2000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.RC_LAN_HOST || "127.0.0.1";
  const port = Number(process.env.RC_LAN_PORT || 8766);
  const upstreamPort = Number(process.env.RC_TUNE_PORT || 8765);
  const { RC_LAN_CERT: cert, RC_LAN_KEY: key } = process.env;
  if (Boolean(cert) !== Boolean(key)) throw new Error("RC_LAN_CERT 和 RC_LAN_KEY 必须一起指定");
  if (!isIPv4(host) || (host !== "127.0.0.1" && !/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host))) {
    throw new Error("RC_LAN_HOST 仅接受电脑在局域网中的 IPv4 地址");
  }
  if (host !== "127.0.0.1" && !cert && process.env.RC_LAN_ALLOW_HTTP !== "1") {
    throw new Error("局域网访问请提供 HTTPS 证书，或仅在可信测试网络上显式设置 RC_LAN_ALLOW_HTTP=1");
  }
  if (![port, upstreamPort].every(p => Number.isInteger(p) && p > 0 && p <= 65535) || port === upstreamPort) {
    throw new Error("检查网页端口和 rc-tune 端口，两者必须不同");
  }
  const tls = cert ? { cert: await readFile(cert), key: await readFile(key) } : undefined;
  const secret = randomBytes(12).toString("base64url");
  const server = makeRemoteLan({ secret, upstreamPort, upstreamToken: process.env.RC_TUNE_TOKEN, tls });
  server.listen(port, host, () => {
    console.log(`局域网遥控页：${tls ? "https" : "http"}://${host}:${port}/remote-control.html`);
    console.log(`网页调试令牌：${secret}`);
  });
}
