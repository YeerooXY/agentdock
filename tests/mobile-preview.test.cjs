'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { MobilePreview, targetFor } = require('../electron/mobile-preview.cjs');
const { MobileCompanion } = require('../electron/mobile.cjs');

const panel = () => ({ id: 'panel', kind: 'web', alive: true, phoneAllowed: true, url: 'http://localhost:5173/app' });
function response() {
  const r = new EventEmitter(); r.headers = {};
  r.setHeader = (name, value) => { r.headers[name.toLowerCase()] = value; };
  r.writeHead = (status, headers = {}) => { r.status = status; Object.assign(r.headers, headers); };
  r.end = body => { r.body = body; r.emit('finished'); };
  return r;
}
function mockRequest(callback) {
  const request = new EventEmitter(); request.end = () => callback(request); request.destroy = () => {};
  return request;
}
function run(preview, route = '/v1/preview/panel/app') {
  const res = response(), finished = new Promise(resolve => res.once('finished', () => resolve(res)));
  preview.handle({ url: route }, res); return finished;
}

test('target is limited to the selected origin and rejects traversal and absolute URLs', () => {
  const p = panel();
  assert.equal(targetFor(p, '/app?q=1').href, 'http://localhost:5173/app?q=1');
  for (const path of ['//example.com/', '/https://example.com/', '/../secret', '/%2e%2e/secret', '/%252e%252e/x', '/a%2fb/../x', '/%5c%5cexample.com']) assert.equal(targetFor(p, path), null, path);
  for (const url of ['http://example.com/', 'http://localhost.example.com/', 'http://[::1]:5173/']) assert.equal(targetFor({ url }, '/'), null);
});

test('proxy forwards only to the panel loopback origin and strips sensitive headers', async () => {
  const p = panel(); let options;
  const proxy = new MobilePreview({ items: new Map([['panel', p]]) }, { request: (opts, reply) => {
    options = opts; return mockRequest(() => { const upstream = new EventEmitter(); upstream.statusCode = 200; upstream.headers = { 'content-type': 'text/html', 'set-cookie': ['secret=x'], 'content-security-policy': 'blocked' }; reply(upstream); upstream.emit('data', Buffer.from('hello')); upstream.emit('end'); });
  } });
  const result = await run(proxy);
  assert.equal(options.hostname, '127.0.0.1'); assert.equal(options.port, '5173'); assert.equal(options.path, '/app');
  assert.deepEqual(options.headers, { host: 'localhost:5173' });
  assert.equal(result.status, 200); assert.equal(result.body.toString(), 'hello');
  assert.equal(result.headers['set-cookie'], undefined); assert.equal(result.headers['content-security-policy'], undefined);
  p.phoneAllowed = false; assert.equal((await run(proxy)).status, 403);
});

test('proxy blocks off-origin redirects, oversized and slow responses', async () => {
  const p = panel(), sessions = { items: new Map([['panel', p]]) };
  const replyWith = (status, headers, chunks = []) => (opts, reply) => mockRequest(() => {
    const upstream = new EventEmitter(); Object.assign(upstream, { statusCode: status, headers, resume() {}, destroy() {} });
    reply(upstream); for (const chunk of chunks) upstream.emit('data', Buffer.from(chunk)); upstream.emit('end');
  });
  assert.equal((await run(new MobilePreview(sessions, { request: replyWith(302, { location: 'http://example.com/' }) }))).status, 502);
  assert.equal((await run(new MobilePreview(sessions, { request: replyWith(302, { location: 'http://localhost:8000/' }) }))).status, 502);
  const local = await run(new MobilePreview(sessions, { request: replyWith(302, { location: '/next' }) }));
  assert.equal(local.headers.Location, '/v1/preview/panel/next');
  assert.equal((await run(new MobilePreview(sessions, { maxBytes: 3, request: replyWith(200, {}, ['abcd']) }))).status, 502);
  assert.equal((await run(new MobilePreview(sessions, { maxBytes: 3, request: replyWith(200, { 'content-length': '4' }) }))).status, 502);
  assert.equal((await run(new MobilePreview(sessions, { timeout: 5, request: () => mockRequest(() => {}) }))).status, 504);
});

test('preview HTTP route requires authentication before proxying', async () => {
  const res = response(); let called = false;
  await MobileCompanion.prototype.http.call({ authenticate: () => null, preview: { handle() { called = true; } } }, { method: 'GET', url: '/v1/preview/panel/' }, res);
  assert.equal(res.status, 401); assert.equal(called, false);
});
