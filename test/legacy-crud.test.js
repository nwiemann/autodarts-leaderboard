const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after } = require('node:test');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.SESSION_SECRET = 'integration-test-secret';
process.env.ADMIN_USER = 'test-admin';
process.env.ADMIN_PASSWORD = 'test-password';

const { app, db } = require('../server');

let server;
let baseUrl;
let adminCookie;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  db.close();
});

async function request(path, { method = 'GET', form, cookie } = {}) {
  const headers = {};
  let body;

  if (form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form);
  }

  if (cookie) headers.cookie = cookie;

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body,
    redirect: 'manual'
  });
}

test('protects admin routes and rejects invalid credentials', async () => {
  const adminResponse = await request('/admin');
  assert.equal(adminResponse.status, 302);
  assert.equal(adminResponse.headers.get('location'), '/admin/login');

  const loginResponse = await request('/admin/login', {
    method: 'POST',
    form: { username: 'test-admin', password: 'wrong-password' }
  });
  assert.equal(loginResponse.status, 401);
});

test('supports the legacy player and match CRUD workflow', async () => {
  const loginResponse = await request('/admin/login', {
    method: 'POST',
    form: { username: 'test-admin', password: 'test-password' }
  });
  assert.equal(loginResponse.status, 302);
  assert.equal(loginResponse.headers.get('location'), '/admin');

  const setCookie = loginResponse.headers.get('set-cookie');
  assert.ok(setCookie, 'login should create an admin session');
  adminCookie = setCookie.split(';')[0];

  await request('/admin/players', {
    method: 'POST',
    cookie: adminCookie,
    form: { name: 'Alice' }
  });
  await request('/admin/players', {
    method: 'POST',
    cookie: adminCookie,
    form: { name: 'Bob' }
  });

  const alice = db.prepare('SELECT * FROM players WHERE name = ?').get('Alice');
  const bob = db.prepare('SELECT * FROM players WHERE name = ?').get('Bob');
  assert.ok(alice);
  assert.ok(bob);
  assert.equal(alice.is_active, 1);

  await request(`/admin/players/${alice.id}/toggle`, {
    method: 'POST',
    cookie: adminCookie
  });
  assert.equal(db.prepare('SELECT is_active FROM players WHERE id = ?').get(alice.id).is_active, 0);

  await request(`/admin/players/${alice.id}/toggle`, {
    method: 'POST',
    cookie: adminCookie
  });
  assert.equal(db.prepare('SELECT is_active FROM players WHERE id = ?').get(alice.id).is_active, 1);

  await request('/admin/matches', {
    method: 'POST',
    cookie: adminCookie,
    form: {
      week: '3',
      home_player_id: String(alice.id),
      away_player_id: String(bob.id),
      scheduled_date: '2026-08-01',
      note: 'Legacy CRUD test'
    }
  });

  let match = db.prepare('SELECT * FROM matches').get();
  assert.deepEqual(
    {
      week: match.week,
      homePlayerId: match.home_player_id,
      awayPlayerId: match.away_player_id,
      scheduledDate: match.scheduled_date,
      note: match.note,
      status: match.status
    },
    {
      week: 3,
      homePlayerId: alice.id,
      awayPlayerId: bob.id,
      scheduledDate: '2026-08-01',
      note: 'Legacy CRUD test',
      status: 'scheduled'
    }
  );

  const extraMatchIds = [];
  extraMatchIds.push(db.prepare(`
    INSERT INTO matches (week, home_player_id, away_player_id, status, note)
    VALUES (1, ?, ?, 'postponed', 'Old postponed match')
  `).run(alice.id, bob.id).lastInsertRowid);
  extraMatchIds.push(db.prepare(`
    INSERT INTO matches (week, home_player_id, away_player_id, status)
    VALUES (2, ?, ?, 'played')
  `).run(alice.id, bob.id).lastInsertRowid);

  const defaultPublicResponse = await request('/');
  assert.equal(defaultPublicResponse.status, 200);
  const defaultPublicHtml = await defaultPublicResponse.text();
  assert.match(defaultPublicHtml, /<option value="3" selected>Woche 3<\/option>/);
  assert.match(defaultPublicHtml, /<strong>1<\/strong> von 3 Spielen/);

  const allPublicResponse = await request('/?week=all&status=all&player=all');
  assert.equal(allPublicResponse.status, 200);
  const allPublicHtml = await allPublicResponse.text();
  assert.match(allPublicHtml, /<option value="all" selected>Alle Wochen<\/option>/);
  assert.match(allPublicHtml, /<strong>3<\/strong> von 3 Spielen/);

  const matchesApiResponse = await request('/api/matches');
  assert.equal(matchesApiResponse.status, 200);
  assert.equal((await matchesApiResponse.json()).length, 3);

  db.prepare('DELETE FROM matches WHERE id IN (?, ?)').run(...extraMatchIds);

  const protectedDeleteResponse = await request(`/admin/players/${alice.id}/delete`, {
    method: 'POST',
    cookie: adminCookie
  });
  assert.equal(protectedDeleteResponse.headers.get('location'), '/admin?error=player_has_matches');
  assert.ok(db.prepare('SELECT id FROM players WHERE id = ?').get(alice.id));

  const resultResponse = await request(`/admin/matches/${match.id}/result?status=scheduled&week=3`, {
    method: 'POST',
    cookie: adminCookie,
    form: {
      home_legs: '3',
      away_legs: '1',
      played_at: '2026-08-02',
      note: '3:1 result'
    }
  });
  assert.equal(resultResponse.headers.get('location'), '/admin?status=scheduled&week=3');

  match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
  assert.equal(match.status, 'played');
  assert.equal(match.home_legs, 3);
  assert.equal(match.away_legs, 1);
  assert.equal(match.played_at, '2026-08-02');

  const standingsResponse = await request('/api/standings');
  assert.equal(standingsResponse.status, 200);
  const standings = await standingsResponse.json();
  assert.equal(standings[0].name, 'Alice');
  assert.equal(standings[0].points, 2);

  await request(`/admin/matches/${match.id}/postpone?status=played&week=3`, {
    method: 'POST',
    cookie: adminCookie,
    form: { note: 'New date required' }
  });
  match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
  assert.equal(match.status, 'postponed');
  assert.equal(match.note, 'New date required');

  await request(`/admin/matches/${match.id}/delete?status=open&week=3`, {
    method: 'POST',
    cookie: adminCookie
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM matches').get().count, 0);

  await request(`/admin/players/${alice.id}/delete`, {
    method: 'POST',
    cookie: adminCookie
  });
  await request(`/admin/players/${bob.id}/delete`, {
    method: 'POST',
    cookie: adminCookie
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM players').get().count, 0);
});
