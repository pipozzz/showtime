import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownerStats, statsConfig } from './stats';

test('stats are off without an API key; host and site fall back sensibly', () => {
  assert.equal(statsConfig({}), null);
  assert.deepEqual(statsConfig({ PLAUSIBLE_API_KEY: 'k', PLAUSIBLE_SRC: 'https://stats.example.com/js/pa-x.js', BETTER_AUTH_URL: 'https://app.starring.dev' }), {
    key: 'k',
    host: 'https://stats.example.com',
    site: 'app.starring.dev',
  });
  assert.deepEqual(statsConfig({ PLAUSIBLE_API_KEY: 'k', PLAUSIBLE_API_HOST: 'https://p.example', PLAUSIBLE_SITE_ID: 'x.dev', SITE_URL: 'https://y.dev' }), { key: 'k', host: 'https://p.example', site: 'x.dev' });
  assert.equal(statsConfig({ PLAUSIBLE_API_KEY: 'k' }), null, 'no site to ask about');
});

test("an owner's numbers come from four filtered queries", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const bodies: Record<string, unknown>[] = [];
  const get = (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://stats.example.com/api/v2/query');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer secret');
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    const dim = body.dimensions?.[0];
    const results =
      dim === 'time:day' ? [{ dimensions: [today], metrics: [7] }]
      : dim === 'visit:source' ? [{ dimensions: ['LinkedIn'], metrics: [5] }, { dimensions: [''], metrics: [2] }]
      : dim === 'visit:country_name' ? [{ dimensions: ['Slovakia'], metrics: [6] }]
      : [{ dimensions: [], metrics: [9, 14] }];
    return Response.json({ results });
  }) as typeof fetch;
  const env = { PLAUSIBLE_API_KEY: 'secret', PLAUSIBLE_SRC: 'https://stats.example.com/js/pa-x.js', SITE_URL: 'https://app.starring.dev' };
  const s = await ownerStats('/jane/', get, env);
  assert.ok(s);
  assert.equal(s.visitors, 9);
  assert.equal(s.pageviews, 14);
  assert.equal(s.daily.length, 30);
  assert.deepEqual(s.daily.at(-1), { date: today, visitors: 7 });
  assert.equal(s.daily[0].visitors, 0, 'gaps filled with zeros');
  assert.deepEqual(s.sources, [{ name: 'LinkedIn', visitors: 5 }, { name: 'Direct / none', visitors: 2 }]);
  assert.deepEqual(s.countries, [{ name: 'Slovakia', visitors: 6 }]);
  for (const b of bodies) {
    assert.equal(b.site_id, 'app.starring.dev');
    assert.deepEqual(b.filters, [['is', 'event:page', ['/jane/', '/jane']]], 'only this profile’s page');
  }
  // cached: a second call doesn't hit Plausible
  const before = bodies.length;
  await ownerStats('/jane/', get, env);
  assert.equal(bodies.length, before);
});
