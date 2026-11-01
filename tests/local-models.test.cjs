'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { strataConfig, strataModels, strataTaskCandidates, STRATA_MODEL, STRATA_ACCOUNT } = require('../electron/local-models.cjs');
const { StrataReadiness } = require('../electron/local-models.cjs');

test('local readiness is cached, expires and invalidates when the endpoint changes', async () => {
  let now = 1000, profiles = [{ id:'strata',protocol:'chat',url:'http://127.0.0.1:8080/v1/chat/completions' }], calls = 0;
  const status = new StrataReadiness({getProfiles:()=>profiles,now:()=>now,fetcher:async(url,options)=>{calls++;assert.ok(url.endsWith('/models'));assert.equal(options.redirect,'error');return{ok:true,json:async()=>({data:[{id:'local-model'}]})}}});
  assert.equal(status.snapshot().available,false);
  await Promise.all([status.refresh(),status.refresh()]); assert.equal(calls,1); assert.equal(status.snapshot().readiness,'ready');
  now+=60001; assert.equal(status.snapshot().available,false);
  await status.refresh(); profiles=[{...profiles[0],url:'http://localhost:8081/v1/chat/completions'}]; assert.equal(status.snapshot().available,false);
  profiles=[]; assert.equal((await status.refresh()).readiness,'unconfigured'); assert.equal(calls,2);
});
test('failed discovery never marks a configured local profile ready', async () => {
  const status = new StrataReadiness({getProfiles:()=>[{id:'strata',protocol:'chat',url:'http://127.0.0.1:8080/v1/chat/completions'}],fetcher:async()=>{throw Error('offline')}});
  assert.equal((await status.refresh()).readiness,'offline'); assert.equal(status.snapshot().available,false);
});
const { prepareCli } = require('../electron/cli-launch.cjs');
const profile = { id: 'strata', protocol: 'chat', url: 'http://127.0.0.1:8080/v1/chat/completions', keyId: '' };

test('Strata task account requires installation and opt-in, with no cloud sign-in', () => {
  assert.deepEqual(strataTaskCandidates(null, [profile]), []);
  assert.deepEqual(strataTaskCandidates('/fake/opencode', []), []);
  const [candidate] = strataTaskCandidates('/fake/opencode', [profile]);
  assert.equal(candidate.id, STRATA_ACCOUNT); assert.equal(candidate.model, STRATA_MODEL);
  assert.equal(candidate.local, true);
  assert.deepEqual(strataTaskCandidates('/fake/opencode', [{ ...profile, keyId: 'private' }]), []);
});

test('local model choice requires an opted-in loopback profile without credentials', () => {
  assert.deepEqual(strataModels([]), []);
  assert.equal(strataModels([profile])[0].id, STRATA_MODEL);
  for (const change of [
    { keyId: 'private_key' }, { protocol: 'responses' },
    { url: 'https://example.com/v1/chat/completions' },
    { url: 'http://localhost.evil/v1/chat/completions' },
    { url: 'http://user:secret@localhost/v1/chat/completions' },
    { url: 'http://localhost/v1/chat/completions?key=secret' },
    { url: 'http://localhost/other' }
  ]) {
    assert.deepEqual(strataModels([{ ...profile, ...change }]), []);
    assert.throws(() => strataConfig([{ ...profile, ...change }]), /localhost with No key/);
  }
  for (const host of ['localhost:9090', '[::1]:8081']) {
    assert.equal(strataConfig([{ ...profile, url: `http://${host}/v1/chat/completions` }]).provider.strata.options.baseURL, `http://${host}/v1`);
  }
});

test('selected Strata console routes both primary and small models locally and keeps the Paddock bridge', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-strata-'));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir())); fs.rmSync(directory, { recursive: true, force: true }); });
  const options = { directory, runtime: { node: process.execPath, tools: path.join(directory, 'bridge.cjs') }, summary: 'Use local tools.', summaryPath: path.join(directory, 'instructions.md'), profiles: [profile] };
  const ordinary = JSON.parse(prepareCli('opencode', { ...options, model: 'cloud/example' }).env.OPENCODE_CONFIG_CONTENT);
  assert.equal(ordinary.provider, undefined);
  assert.equal(ordinary.small_model, undefined);
  const launch = prepareCli('opencode', { ...options, model: STRATA_MODEL });
  const config = JSON.parse(launch.env.OPENCODE_CONFIG_CONTENT);
  assert.deepEqual(launch.args, ['--model', STRATA_MODEL]);
  assert.equal(config.model, STRATA_MODEL); assert.equal(config.small_model, STRATA_MODEL);
  assert.deepEqual(config.enabled_providers, ['strata']);
  assert.equal(config.share, 'disabled');
  const { limit } = config.provider.strata.models.local;
  assert.equal(limit.context, 262144);
  // A turn must fit OpenCode's tool prompt and a long reasoning reply without compacting.
  assert.ok(limit.context - config.compaction.buffer - limit.output > 200000);
  assert.equal(config.provider.strata.options.apiKey, undefined);
  assert.deepEqual(config.mcp.paddock.command, [options.runtime.node, options.runtime.tools]);
  assert.deepEqual(config.instructions, [options.summaryPath]);
  assert.throws(() => prepareCli('opencode', { ...options, model: STRATA_MODEL, profiles: [] }), /Save the Strata/);
});
