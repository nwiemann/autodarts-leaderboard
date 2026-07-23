const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const viewsDirectory = path.join(__dirname, '..', 'views');

function createViewData() {
  const players = [
    { id: 1, name: 'Alice', is_active: 1 },
    { id: 2, name: 'Bob', is_active: 1 }
  ];
  const matches = [
    {
      id: 10,
      week: 2,
      home_name: 'Alice',
      away_name: 'Bob',
      home_legs: null,
      away_legs: null,
      scheduled_date: '2026-07-23',
      played_at: null,
      note: null,
      status: 'scheduled'
    }
  ];

  return {
    isAuthenticated: false,
    adminUser: null,
    standings: [],
    players,
    matches,
    totalMatches: 6,
    matchWeeks: [1, 2, 3],
    filterQuery: 'status=open&week=2',
    filters: { week: 2, status: 'open', player: 'all' },
    success: '',
    error: ''
  };
}

test('renders public filters and compact matches without week accordions', async () => {
  const html = await ejs.renderFile(
    path.join(viewsDirectory, 'index.ejs'),
    createViewData()
  );

  assert.match(html, /name="week"/);
  assert.match(html, /name="status"/);
  assert.match(html, /name="player"/);
  assert.match(html, /<details class="match-item compact-match-item">/);
  assert.match(html, /class="info-trigger"/);
  assert.doesNotMatch(html, /class="week-group"/);
  assert.doesNotMatch(html, /class="badge scheduled"/);
  assert.match(html, /1<\/strong> von 6 Spielen/);
  assert.match(html, /Alice/);
  assert.match(html, /Bob/);
  assert.match(html, /Spielwoche/);
});

test('renders compact admin matches and preserves filters in match actions', async () => {
  const html = await ejs.renderFile(
    path.join(viewsDirectory, 'admin.ejs'),
    { ...createViewData(), isAuthenticated: true }
  );

  assert.match(html, /Offene Spiele/);
  assert.match(html, /<details class="match-item admin-item">/);
  assert.match(html, /class="admin-match-summary"/);
  assert.doesNotMatch(html, /class="week-group"/);
  assert.match(html, /\/result\?status=open&amp;week=2/);
  assert.match(html, /\/postpone\?status=open&amp;week=2/);
  assert.match(html, /\/delete\?status=open&amp;week=2/);
});
