import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const trackingSource = await readFile(new URL('./tracking.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');

function createHarness({ consent = null, pixelId = '12345', failConfig = false } = {}) {
  const listeners = new Map();
  const elements = Object.fromEntries(['#trackingConsent', '#privacySettings', '#acceptTracking', '#rejectTracking'].map(selector => [selector, {
    hidden: selector === '#trackingConsent',
    focus() {},
    addEventListener(name, handler) { listeners.set(`${selector}:${name}`, handler); }
  }]));
  const scripts = [];
  let configRequests = 0;
  const localValues = new Map(consent ? [['owf_analytics_consent_v1', consent]] : []);
  const document = {
    head: { appendChild(script) { scripts.push(script); } },
    createElement() { return {}; },
    querySelector(selector) { return elements[selector]; }
  };
  const window = {};
  const context = {
    document,
    window,
    localStorage: {
      getItem(key) { return localValues.get(key) ?? null; },
      setItem(key, value) { localValues.set(key, value); }
    },
    fetch: async () => {
      configRequests++;
      if (failConfig) throw new Error('config unavailable');
      return { ok: true, json: async () => ({ pixelId }) };
    },
    Object,
    String,
    Promise
  };
  vm.runInNewContext(trackingSource, context);
  return {
    elements,
    listeners,
    scripts,
    window,
    get configRequests() { return configRequests; },
    async flush() { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); },
    calls() { return Array.from(window.fbq?.queue || [], args => Array.from(args)); }
  };
}

test('without analytics consent no Pixel config request, PageView, or Lead is sent', () => {
  const harness = createHarness();
  harness.window.metaTracking.trackLead();
  assert.equal(harness.configRequests, 0);
  assert.equal(harness.scripts.length, 0);
});

test('rejecting analytics consent keeps the Pixel unloaded', () => {
  const harness = createHarness();
  harness.listeners.get('#rejectTracking:click')();
  harness.window.metaTracking.trackLead();
  assert.equal(harness.configRequests, 0);
  assert.equal(harness.scripts.length, 0);
});

test('consented visitor gets one PageView and one parameter-free Lead despite repeated calls', async () => {
  const harness = createHarness({ consent: 'granted' });
  await harness.flush();
  harness.window.metaTracking.trackLead();
  harness.window.metaTracking.trackLead();
  harness.listeners.get('#acceptTracking:click')();
  await harness.flush();

  const events = harness.calls().filter(([method]) => method === 'track');
  assert.deepEqual(events, [['track', 'PageView'], ['track', 'Lead']]);
  assert.equal(harness.configRequests, 1);
  assert.equal(harness.scripts.length, 1);
});

test('Lead tracking is reached only after the API confirms a saved application ID', () => {
  const failedResponseCheck = appSource.indexOf('if (!response.ok) throw');
  const savedIdCheck = appSource.indexOf("if (typeof result.id !== 'string' || !result.id)");
  const leadCall = appSource.indexOf('window.metaTracking?.trackLead()');
  assert.ok(failedResponseCheck >= 0 && savedIdCheck > failedResponseCheck && leadCall > savedIdCheck);
  assert.equal(appSource.match(/metaTracking\?\.trackLead\(\)/g)?.length, 1);
});

test('Pixel initialization failure does not send events or interfere with page behavior', async () => {
  const harness = createHarness({ consent: 'granted', failConfig: true });
  await harness.flush();
  harness.window.metaTracking.trackLead();
  assert.deepEqual(harness.calls(), []);
  assert.equal(harness.scripts.length, 0);
});
