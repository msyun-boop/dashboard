const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ORIGIN = 'https://msyun-boop.github.io';
const CURRENT = 'dashboard-v9-routine-delete';
const source = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
const keyFor = input => new URL(typeof input === 'string' ? input : input.url, ORIGIN).href;

function harness() {
  const handlers = {}, stores = new Map(), replies = new Map(), calls = [];
  let offline = false, skipCount = 0, claimCount = 0, cacheUnavailable = false;
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const values = stores.get(name);
    return {
      async match(input) { const found = values.get(keyFor(input)); return found && found.clone(); },
      async put(input, response) { values.set(keyFor(input), response.clone()); }
    };
  };
  vm.runInNewContext(source, {
    URL, Promise,
    self: {
      location: {origin: ORIGIN},
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => { skipCount++; },
      clients: {claim: async () => { claimCount++; }}
    },
    caches: {
      open: async name => { if (cacheUnavailable) throw Error('cache unavailable'); return cache(name); },
      keys: async () => [...stores.keys()],
      delete: async name => stores.delete(name)
    },
    fetch: async (input, options) => {
      const key = keyFor(input); calls.push({key, options});
      if (offline) throw Error('offline');
      const configured = replies.get(key);
      if (configured instanceof Error) throw configured;
      return (configured || new Response('network:' + key, {status: 200})).clone();
    }
  });
  return {
    stores, calls,
    get skipped() { return skipCount; },
    get claimed() { return claimCount; },
    reply(url, body, status = 200) { replies.set(keyFor(url), new Response(body, {status})); },
    fail(url) { replies.set(keyFor(url), Error('asset unavailable')); },
    redirect(url, destination) {
      const response = new Response('redirected login', {status: 200});
      const clone = response.clone.bind(response);
      response.clone = () => { const copy = clone(); Object.defineProperty(copy, 'url', {value: destination}); return copy; };
      replies.set(keyFor(url), response);
    },
    offline(value = true) { offline = value; },
    cacheUnavailable(value = true) { cacheUnavailable = value; },
    async seed(url, body, name = CURRENT) { await cache(name).put(url, new Response(body)); },
    async cached(url, name = CURRENT) { const response = await cache(name).match(url); return response && response.text(); },
    async lifecycle(name) {
      let pending;
      handlers[name]({waitUntil: value => { pending = value; }});
      await pending;
    },
    async request(url, {mode = 'navigate', method = 'GET'} = {}) {
      let pending, handled = false;
      handlers.fetch({
        request: {url: keyFor(url), mode, method},
        respondWith: value => { handled = true; pending = value; }
      });
      return handled ? {handled, response: await pending} : {handled};
    }
  };
}

test('install caches independent successful assets despite an unavailable file and a 404', async () => {
  const h = harness();
  h.fail('/dashboard/routine-mobile.css?v=mobile-routine');
  h.reply('/dashboard/icon-512.png', 'missing', 404);
  await h.lifecycle('install');
  assert.equal(h.skipped, 1);
  assert.match(await h.cached('/dashboard/index.html'), /^network:/);
  assert.match(await h.cached('/dashboard/routine.html'), /^network:/);
  assert.equal(await h.cached('/dashboard/routine-mobile.css?v=mobile-routine'), undefined);
  assert.equal(await h.cached('/dashboard/icon-512.png'), undefined);
  assert.equal(h.calls.length, 11);
  assert.ok(h.calls.every(call => call.options.cache === 'reload'));
});

test('root and index navigation share a network-first dashboard shell', async () => {
  const h = harness();
  h.reply('/dashboard/', 'dashboard version one');
  assert.equal(await (await h.request('/dashboard/')).response.text(), 'dashboard version one');
  assert.equal(await h.cached('/dashboard/index.html'), 'dashboard version one');
  h.reply('/dashboard/index.html?refresh=1', 'dashboard version two');
  assert.equal(await (await h.request('/dashboard/index.html?refresh=1')).response.text(), 'dashboard version two');
  h.offline();
  assert.equal(await (await h.request('/dashboard/')).response.text(), 'dashboard version two');
  assert.equal(await (await h.request('/dashboard/index.html')).response.text(), 'dashboard version two');
});

test('routine navigation and offline fallback never replace the dashboard shell', async () => {
  const h = harness();
  h.reply('/dashboard/', 'dashboard shell');
  h.reply('/dashboard/routine.html?launch=home', 'mobile routine shell');
  await h.request('/dashboard/');
  await h.request('/dashboard/routine.html?launch=home');
  assert.equal(await h.cached('/dashboard/index.html'), 'dashboard shell');
  assert.equal(await h.cached('/dashboard/routine.html'), 'mobile routine shell');
  h.offline();
  assert.equal(await (await h.request('/dashboard/routine.html')).response.text(), 'mobile routine shell');
  assert.equal(await (await h.request('/dashboard/')).response.text(), 'dashboard shell');
});

test('report navigation uses only its exact cache key and unknown routes never receive index HTML', async () => {
  const h = harness();
  await h.seed('/dashboard/index.html', 'dashboard shell');
  h.reply('/dashboard/report.html?team=sales', 'sales report');
  await h.request('/dashboard/report.html?team=sales');
  h.offline();
  assert.equal(await (await h.request('/dashboard/report.html?team=sales')).response.text(), 'sales report');
  await assert.rejects(h.request('/dashboard/report.html?team=other'), /offline/);
  await assert.rejects(h.request('/dashboard/unknown.html'), /offline/);
  assert.equal(await h.cached('/dashboard/index.html'), 'dashboard shell');
});

test('HTTP errors are returned online but cannot poison a working offline shell', async () => {
  const h = harness();
  await h.seed('/dashboard/routine.html', 'working routine');
  h.reply('/dashboard/routine.html', 'temporarily missing', 404);
  assert.equal((await h.request('/dashboard/routine.html')).response.status, 404);
  assert.equal(await h.cached('/dashboard/routine.html'), 'working routine');
  h.offline();
  assert.equal(await (await h.request('/dashboard/routine.html')).response.text(), 'working routine');
});

test('cross-origin Firebase and Google, requests outside dashboard, and mutations are ignored', async () => {
  const h = harness();
  const requests = [
    ['https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js', {mode: 'no-cors'}],
    ['https://accounts.google.com/oauth', {}],
    ['https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel', {method: 'POST'}],
    ['/another-site/index.html', {}],
    ['/dashboard/routine.html', {method: 'POST'}]
  ];
  for (const [url, options] of requests) assert.equal((await h.request(url, options)).handled, false);
  assert.equal(h.calls.length, 0);
});

test('uncached JS and CSS fail offline instead of receiving dashboard HTML', async () => {
  const h = harness();
  await h.seed('/dashboard/index.html', 'dashboard HTML');
  h.offline();
  for (const asset of ['/dashboard/routine-app.js?v=mobile-routine', '/dashboard/routine-mobile.css?v=mobile-routine']) {
    await assert.rejects(h.request(asset, {mode: 'cors'}), /offline/);
  }
  assert.equal((await h.request('/dashboard/unrelated.js', {mode: 'cors'})).handled, false);
});

test('known static assets use their exact versioned cache entry', async () => {
  const h = harness();
  const url = '/dashboard/routine-mobile.css?v=mobile-routine';
  await h.seed(url, 'routine stylesheet');
  h.offline();
  assert.equal(await (await h.request(url, {mode: 'cors'})).response.text(), 'routine stylesheet');
  assert.equal(h.calls.length, 0);
  assert.equal((await h.request('/dashboard/routine-mobile.css?v=another-version', {mode: 'cors'})).handled, false);
});

test('activation deletes only older dashboard caches and preserves unrelated caches', async () => {
  const h = harness();
  await h.seed('/dashboard/index.html', 'current');
  await h.seed('/dashboard/index.html', 'old', 'dashboard-v7-weekly-schedules');
  await h.seed('/dashboard/index.html', 'old', 'dashboard-v6-routine-preservation');
  await h.seed('/unrelated', 'other data', 'notes-offline-v3');
  await h.lifecycle('activate');
  assert.deepEqual([...h.stores.keys()].sort(), [CURRENT, 'notes-offline-v3'].sort());
  assert.equal(h.claimed, 1);
  assert.equal(await h.cached('/unrelated', 'notes-offline-v3'), 'other data');
});

test('cross-origin redirected responses cannot replace an offline shell', async () => {
  const h = harness();
  await h.seed('/dashboard/routine.html', 'existing routine');
  h.redirect('/dashboard/routine.html', 'https://accounts.google.com/login');
  assert.equal(await (await h.request('/dashboard/routine.html')).response.text(), 'redirected login');
  assert.equal(await h.cached('/dashboard/routine.html'), 'existing routine');
});

test('same-origin redirects cannot turn routine or report offline entries into the dashboard', async () => {
  const h = harness();
  await h.seed('/dashboard/routine.html', 'existing routine');
  await h.seed('/dashboard/report.html', 'existing report');
  h.redirect('/dashboard/routine.html', ORIGIN + '/dashboard/index.html');
  h.redirect('/dashboard/report.html', ORIGIN + '/dashboard/');
  await h.request('/dashboard/routine.html');
  await h.request('/dashboard/report.html');
  h.offline();
  assert.equal(await (await h.request('/dashboard/routine.html')).response.text(), 'existing routine');
  assert.equal(await (await h.request('/dashboard/report.html')).response.text(), 'existing report');
});

test('device cache failure does not interrupt a successful online navigation', async () => {
  const h = harness();
  h.cacheUnavailable();
  h.reply('/dashboard/routine.html', 'online routine');
  assert.equal(await (await h.request('/dashboard/routine.html')).response.text(), 'online routine');
  await h.lifecycle('install');
  assert.equal(h.skipped, 1);
});
