import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createAppServer, proxyCookie, schoolCookies } from './app.mjs';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

test('proxy rewrites cookies/redirects, isolates users, forwards body and clears browser sessions', async () => {
  const requests = []; let id = 0;
  const upstream = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, cookie: req.headers.cookie || '', body });
    if (req.url === '/jsxsd/') { res.setHeader('Set-Cookie', `JSESSIONID=user${++id}; Domain=school.invalid; Path=/jsxsd`); return res.end('login page'); }
    if (req.url === '/jsxsd/xk/LoginToXk') { res.writeHead(302, { Location: '/jsxsd/framework/xsMainV.htmlx' }); return res.end(); }
    if (req.url.startsWith('/jsxsd/verifycode.servlet')) { res.setHeader('Content-Type', 'image/png'); return res.end(Buffer.from([0,1,2,255])); }
    res.end('authenticated response');
  });
  const upstreamOrigin = await listen(upstream);
  const app = createAppServer({ upstreamBase: `${upstreamOrigin}/jsxsd/` });
  const origin = await listen(app);
  const headers = { 'X-SDUST-Client': '1' };
  try {
    const first = await fetch(`${origin}/api/jsxsd/`, { headers });
    const cookieA = first.headers.getSetCookie()[0];
    assert.match(cookieA, /^sdust_proxy_JSESSIONID=user1;/); assert.match(cookieA, /HttpOnly/); assert.match(cookieA, /Max-Age=2592000/);
    assert.doesNotMatch(cookieA, /Domain=/); assert.equal(first.headers.get('cache-control'), 'no-store');
    const second = await fetch(`${origin}/api/jsxsd/`, { headers });
    assert.match(second.headers.getSetCookie()[0], /^sdust_proxy_JSESSIONID=user2;/);
    assert.equal(requests[1].cookie, '');
    const login = await fetch(`${origin}/api/jsxsd/xk/LoginToXk`, { method: 'POST', redirect: 'manual', headers: { ...headers, Cookie: 'sdust_proxy_JSESSIONID=user1; unrelated=private' }, body: 'encoded=abc&RANDOMCODE=1234' });
    assert.equal(login.status, 302); assert.equal(login.headers.get('location'), '/api/jsxsd/framework/xsMainV.htmlx');
    assert.equal(requests.at(-1).cookie, 'JSESSIONID=user1'); assert.equal(requests.at(-1).body, 'encoded=abc&RANDOMCODE=1234');
    const image = await fetch(`${origin}/api/jsxsd/verifycode.servlet?_t=1`, { headers });
    assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [0,1,2,255]);
    const logout = await fetch(`${origin}/api/jsxsd/__session`, { method: 'DELETE', headers: { ...headers, Cookie: 'sdust_proxy_JSESSIONID=user1' } });
    assert.equal(logout.status, 200); assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/);
  } finally { await close(app); await close(upstream); }
});

test('static shell headers, API no-fallback and cross-origin/path restrictions', async () => {
  const app = createAppServer(); const origin = await listen(app);
  try {
    const page = await fetch(`${origin}/timetable`); assert.equal(page.status, 200); assert.match(await page.text(), /id="app"/);
    const sw = await fetch(`${origin}/sw.js`); assert.equal(sw.status, 200); assert.equal(sw.headers.get('cache-control'), 'no-cache');
    const api = await fetch(`${origin}/api/unknown`, { headers: { 'X-SDUST-Client': '1' } }); assert.equal(api.status, 404); assert.doesNotMatch(await api.text(), /id="app"/);
    const cross = await fetch(`${origin}/api/jsxsd/`, { headers: { 'X-SDUST-Client': '1', Origin: 'https://evil.example' } }); assert.equal(cross.status, 403);
    const missing = await fetch(`${origin}/api/jsxsd/`); assert.equal(missing.status, 403);
    const restricted = await fetch(`${origin}/api/jsxsd/unknown-admin-path`, { headers: { 'X-SDUST-Client': '1' } }); assert.equal(restricted.status, 404);
    const unknown = await fetch(`${origin}/not-a-route`); assert.equal(unknown.status, 404);
    const traversal = await fetch(`${origin}/%2e%2e/package.json`); assert.equal(traversal.status, 404);
  } finally { await close(app); }
});

test('cookie rewriting preserves expiry and never leaks unrelated site cookies', () => {
  assert.equal(schoolCookies('token=secret; sdust_proxy_JSESSIONID=mine; other=x; sdust_proxy_route=node1'), 'JSESSIONID=mine; route=node1');
  assert.match(proxyCookie('JSESSIONID=; Max-Age=0; Path=/; Secure', true), /Secure; Max-Age=0$/);
  assert.equal(proxyCookie('bad name=value', true), null);
});
