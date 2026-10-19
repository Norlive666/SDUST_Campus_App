import http from 'node:http';
import https from 'node:https';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = '/api/jsxsd/';
const COOKIE_PREFIX = 'sdust_proxy_';
const ROUTES = new Set(['', 'verifycode.servlet', 'xk/LoginToXk', 'grxx/xsxx', 'framework/xsMainV.htmlx',
  'xskb/xskb_list.do', 'kscj/cjcx_query', 'kscj/cjcx_list', 'xsks/xsksap_list', 'xsks/xsks_list']);
const PAGES = new Set(['/', '/login', '/timetable', '/grade', '/exam', '/profile']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

export function schoolCookies(value = '') {
  return value.split(';').map(part => part.trim()).filter(part => part.startsWith(COOKIE_PREFIX) && part.includes('='))
    .map(part => part.slice(COOKIE_PREFIX.length)).join('; ');
}
export function proxyCookie(value, secure) {
  const [pair, ...attributes] = value.split(';');
  const index = pair.indexOf('=');
  if (index < 1 || !/^[\w.-]+$/.test(pair.slice(0, index))) return null;
  const expiry = attributes.map(item => item.trim()).filter(item => /^(max-age|expires)=/i.test(item));
  if (!expiry.length) expiry.push('Max-Age=2592000');
  return [`${COOKIE_PREFIX}${pair}`, `Path=${PREFIX}`, 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : []), ...expiry].join('; ');
}
function send(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error: message }));
}

export function createAppServer({ distDir = resolve('dist'), publicOrigin = 'http://127.0.0.1:3000',
  upstreamBase = 'https://jwglxt.sdust.edu.cn/jsxsd/' } = {}) {
  const origin = new URL(publicOrigin).origin;
  const base = new URL(upstreamBase);
  const secure = origin.startsWith('https://');
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) return send(res, 400, '请求路径无效');
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
        if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, '仅允许同源请求');
        if (req.headers['x-sdust-client'] !== '1') return send(res, 403, '请求来源无效');
        if (url.pathname === `${PREFIX}__session` && req.method === 'DELETE') {
          const names = (req.headers.cookie || '').split(';').map(item => item.trim().split('=')[0]).filter(name => name.startsWith(COOKIE_PREFIX) && /^[\w.-]+$/.test(name));
          res.setHeader('Set-Cookie', names.map(name => `${name}=; Path=${PREFIX}; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`));
          return send(res, 200, '已清理会话');
        }
        if (!url.pathname.startsWith(PREFIX) || !ROUTES.has(url.pathname.slice(PREFIX.length))) return send(res, 404, '接口不存在');
        if (!['GET', 'POST'].includes(req.method)) return send(res, 405, '请求方法不支持');
        const chunks = []; let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 1024 * 1024) return send(res, 413, '请求体过大');
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);
        const target = new URL(url.pathname.slice(PREFIX.length) + url.search, base);
        const cookie = schoolCookies(req.headers.cookie);
        const upstream = (target.protocol === 'https:' ? https : http).request(target, {
          method: req.method,
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', Accept: req.headers.accept || '*/*',
            'Accept-Encoding': 'identity', Referer: base.href, Origin: base.origin,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(req.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length } : {}) },
          timeout: 20000,
        }, response => {
          const headers = { 'Cache-Control': 'no-store', 'Content-Type': response.headers['content-type'] || 'text/plain; charset=utf-8' };
          const cookies = (response.headers['set-cookie'] || []).map(value => proxyCookie(value, secure)).filter(Boolean);
          if (cookies.length) headers['Set-Cookie'] = cookies;
          if (response.headers['content-encoding']) headers['Content-Encoding'] = response.headers['content-encoding'];
          if (response.headers.location) {
            const destination = new URL(response.headers.location, target);
            if (destination.origin !== base.origin || !destination.pathname.startsWith(base.pathname)) {
              response.resume(); return send(res, 502, '教务重定向地址不受支持');
            }
            headers.Location = PREFIX + destination.pathname.slice(base.pathname.length) + destination.search;
          }
          res.writeHead(response.statusCode || 502, headers);
          response.on('error', () => res.destroy());
          response.pipe(res);
        });
        upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
        upstream.on('error', () => { if (!res.headersSent) send(res, 502, '教务连接失败，请稍后重试'); else res.destroy(); });
        res.on('close', () => upstream.destroy());
        upstream.end(body);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, '请求方法不支持');
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(distDir, PAGES.has(pathname) ? 'index.html' : `.${pathname}`);
      if (!file.startsWith(resolve(distDir) + '/')) return send(res, 404, '文件不存在');
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) return send(res, 404, '文件不存在');
      res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.setHeader('Content-Length', info.size);
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy()); stream.pipe(res);
    } catch (_) { if (!res.headersSent) send(res, 500, '服务暂不可用'); else res.destroy(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const publicOrigin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
  if (process.env.NODE_ENV === 'production' && !publicOrigin.startsWith('https://')) throw new Error('PUBLIC_ORIGIN 必须配置为实际 HTTPS 网站地址');
  createAppServer({ publicOrigin }).listen(port, '0.0.0.0', () => console.log(`Web app listening on port ${port}`));
}
