const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const video = require('../x-video.js');
const settings = require('../settings.js');

test('X video URLs are validated and canonicalized without browsing parameters', () => {
  assert.deepEqual(video.parseUrl('https://twitter.com/example/status/123456789/video/1?s=20&t=5s'), { videoId: 'example:123456789', postId: '123456789', author: 'example', url: 'https://x.com/example/status/123456789' });
  assert.equal(video.canonicalUrl('example:123456789'), 'https://x.com/example/status/123456789');
  for (const url of ['https://x.com.evil.test/example/status/123', 'https://x.com/messages/123', 'https://x.com/home', 'http://x.com/example/status/123', 'https://x.com/example/status/123/video/2']) assert.equal(video.parseUrl(url), null);
  assert.throws(() => video.canonicalUrl('<script>'), /Invalid X video ID/);
});
test('timestamped chunks preserve subsecond media timing and speaker text', () => {
  const result = video.parseTranscript({ lang: 'en', content: [{ text: 'Second.', offset: 4200, duration: 1800 }, { text: '>> First.', offset: 1250, duration: 2950 }] });
  assert.equal(result.success, true); assert.equal(result.transcript[0].start, 1.25); assert.equal(result.transcript[0].duration, 2.95);
  assert.equal(result.transcriptTextTimestamped, '[0:01] First.\n[0:04] Second.');
  assert.equal(video.parseTranscript({ content: [] }).success, false);
  assert.equal(video.parseTranscript({ content: [{ text: 'Bad timestamp', offset: NaN }] }).success, false);
  assert.equal(video.parseTranscript({ result: { lang: 'en', content: [{ text: 'Ready', offset: 0, duration: 1 }] } }).success, true);
});
test('settings preserve the reference model and require explicit generation opt-in', () => {
  assert.equal(settings.normalize({}).transcriptMode, 'native');
  assert.equal(settings.normalize({ transcriptMode: 'generate' }).transcriptMode, 'native');
  assert.equal(settings.normalize({ transcriptMode: 'auto' }).transcriptMode, 'auto');
  assert.equal(settings.normalize({}).aiModel, 'deepseek-v4-flash');
});

function transcriptHarness(fetchImpl, mode = 'native', initial = {}) {
  const storage = { ytd_settings: { supadataApiKey: 'test-supadata', transcriptMode: mode }, ...initial };
  const sandbox = { URL, AbortController, console, Date, setTimeout, clearTimeout, XVD_VIDEO: video, YTD_SETTINGS: settings, fetch: fetchImpl,
    chrome: { storage: { local: { get: async key => ({ [key]: storage[key] }), set: async values => Object.assign(storage, values), remove: async key => { delete storage[key]; } } } } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../transcript.js'), 'utf8'), sandbox);
  return { api: sandbox.XVD_TRANSCRIPT, storage };
}
test('native transcript request sends the exact X post and does not silently generate', async () => {
  const { api } = transcriptHarness(async (url, options) => {
    const parsed = new URL(url); assert.equal(parsed.searchParams.get('url'), 'https://x.com/example/status/123');
    assert.equal(parsed.searchParams.get('mode'), 'native'); assert.equal(parsed.searchParams.get('text'), 'false');
    assert.equal(options.headers['x-api-key'], 'test-supadata');
    return Response.json({ lang: 'en', content: [{ text: 'Hello', offset: 1000, duration: 2000 }] });
  });
  assert.equal((await api.fetchTranscript('example:123')).transcript[0].start, 1);
});
test('missing native subtitles produce an opt-in explanation, not a second paid request', async () => {
  let calls = 0;
  const { api } = transcriptHarness(async () => { calls++; return new Response('{}', { status: 206 }); });
  const result = await api.fetchTranscript('example:123');
  assert.equal(result.error, 'NO_TRANSCRIPT'); assert.equal(calls, 1);
});
test('202 subtitle jobs are saved and completed without duplicate submission', async () => {
  let calls = 0;
  const { api, storage } = transcriptHarness(async url => {
    calls++;
    if (url.includes('/transcript?')) return Response.json({ jobId: 'job-123' }, { status: 202 });
    assert.equal(url, 'https://api.supadata.ai/v1/transcript/job-123');
    assert.equal(storage['xvd_job_example:123'].jobId, 'job-123');
    return Response.json({ status: 'completed', content: [{ text: 'Done', offset: 0, duration: 1000 }] });
  }, 'auto');
  const first = api.fetchTranscript('example:123');
  assert.equal(api.fetchTranscript('example:123'), first);
  assert.equal((await first).success, true); assert.equal(calls, 2); assert.equal(storage['xvd_job_example:123'], undefined);
});
test('reopened panels resume saved subtitle jobs and retain them after transient network errors', async () => {
  const { api, storage } = transcriptHarness(async url => {
    assert.equal(url, 'https://api.supadata.ai/v1/transcript/saved-job'); throw new TypeError('offline');
  }, 'auto', { 'xvd_job_example:123': { jobId: 'saved-job' } });
  assert.equal((await api.fetchTranscript('example:123')).success, false);
  assert.equal(storage['xvd_job_example:123'].jobId, 'saved-job');
});
