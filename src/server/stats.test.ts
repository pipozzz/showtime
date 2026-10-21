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

test('weekly numbers cover the last full Monday–Sunday and the week before', async () => {
  const { lastWeeks, weekStats } = await import('./stats');
  // Wednesday 2026-10-21 → last week is Mon 12 – Sun 18 Oct, the one before 5–11 Oct
  assert.deepEqual(lastWeeks(new Date('2026-10-21T10:00:00Z')), { week: ['2026-10-12', '2026-10-18'], before: ['2026-10-05', '2026-10-11'] });
  // on a Monday, "last week" is the one that just ended
  assert.deepEqual(lastWeeks(new Date('2026-10-19T09:00:00Z')).week, ['2026-10-12', '2026-10-18']);
  // Sunday still belongs to the current week
  assert.deepEqual(lastWeeks(new Date('2026-10-25T23:00:00Z')).week, ['2026-10-12', '2026-10-18']);

  const bodies: { date_range: unknown; dimensions?: string[]; metrics: string[] }[] = [];
  const get = (async (_: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    bodies.push(b);
    const dim = b.dimensions?.[0];
    const results = dim === 'visit:source' ? [{ dimensions: ['LinkedIn'], metrics: [8] }]
      : dim === 'visit:country_name' ? [{ dimensions: ['Slovakia'], metrics: [7] }]
      : b.date_range[0] === '2026-10-12' ? [{ dimensions: [], metrics: [12, 30] }] : [{ dimensions: [], metrics: [10] }];
    return Response.json({ results });
  }) as typeof fetch;
  const s = await weekStats('/jane/', new Date('2026-10-21T10:00:00Z'), get, { PLAUSIBLE_API_KEY: 'k', SITE_URL: 'https://starring.dev' });
  assert.deepEqual(s, { from: '2026-10-12', to: '2026-10-18', visitors: 12, pageviews: 30, previous: 10, sources: [{ name: 'LinkedIn', visitors: 8 }], countries: [{ name: 'Slovakia', visitors: 7 }] });
  assert.ok(bodies.every((b) => Array.isArray(b.date_range)), 'explicit date ranges');
});
