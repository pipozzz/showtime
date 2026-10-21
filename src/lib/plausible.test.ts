import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromScript, fromSnippet, resolveSnippet } from './plausible';

const NEW = `<!-- Privacy-friendly analytics by Plausible -->
<script async src="https://plausible.example.com/js/pa-lxkAgw0Cbyg5NVRUUJTBl.js"></script>
<script>
  window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
  plausible.init()
</script>`;
const PA = '!function(){var t={endpoint:"https://plausible.example.com/api/event",domain:"app.starring.dev",hashBasedRouting:!1};/* … */}();';

test('new snippet: the pa- script is fetched and read', async () => {
  assert.deepEqual(fromSnippet(NEW), { script: 'https://plausible.example.com/js/pa-lxkAgw0Cbyg5NVRUUJTBl.js' });
  const get = (async (u: string) => (assert.match(u, /pa-lxk/), new Response(PA))) as typeof fetch;
  assert.deepEqual(await resolveSnippet(NEW, get), { site: { domain: 'app.starring.dev', host: 'https://plausible.example.com' } });
  assert.deepEqual(await resolveSnippet(NEW, (async () => new Response('', { status: 404 })) as typeof fetch).then((r) => 'error' in r), true);
});

test('pa- script on plausible.io and behind a sub-path', () => {
  assert.deepEqual(fromScript('{"endpoint":"https://plausible.io/api/event","domain":"jane.dev"}'), { site: { domain: 'jane.dev' } });
  assert.deepEqual(fromScript('x={endpoint:"https://firma.example/stats/api/event",domain:"jane.dev"}'), { site: { domain: 'jane.dev', host: 'https://firma.example/stats' } });
  assert.ok('error' in fromScript('x={endpoint:"http://insecure.example/api/event",domain:"jane.dev"}'));
  assert.ok('error' in fromScript('console.log("hi")'));
});

test('legacy snippet with data-domain (and data-api)', () => {
  assert.deepEqual(fromSnippet('<script defer data-domain="jane.dev" src="https://plausible.io/js/script.js"></script>'), { site: { domain: 'jane.dev' } });
  assert.deepEqual(fromSnippet('<script defer data-domain="jane.dev,all.dev" src="https://stats.example.com/js/script.outbound-links.js"></script>'), { site: { domain: 'jane.dev', host: 'https://stats.example.com' } });
  assert.deepEqual(fromSnippet('<script defer data-domain="jane.dev" data-api="https://proxy.example/x/api/event" src="https://jane.dev/js/script.js"></script>'), { site: { domain: 'jane.dev', host: 'https://proxy.example/x' } });
});

test('garbage and unsafe input is refused', () => {
  for (const bad of ['', 'hello', '<script src="http://plausible.example.com/js/pa-x.js"></script>', '<script defer src="https://plausible.io/js/script.js"></script>']) {
    assert.ok('error' in fromSnippet(bad), bad);
  }
  assert.deepEqual(fromSnippet('https://plausible.example.com/js/pa-abc.js'), { script: 'https://plausible.example.com/js/pa-abc.js' });
});
