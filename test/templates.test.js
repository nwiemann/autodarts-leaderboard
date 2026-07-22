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
    matchGroups: [{ week: 2, matches }],
    totalMatches: 6,
    matchWeeks: [1, 2, 3],
    openWeek: 2,
    filterQuery: 'status=open&week=2',
    filters: { week: 2, status: 'open', player: 'all' },
    success: '',
    error: ''
  };
}

test('renders public filters and grouped match weeks', async () => {
  const html = await ejs.renderFile(
    path.join(viewsDirectory, 'index.ejs'),
    createViewData()
  );

  assert.match(html, /name="week"/);
  assert.match(html, /name="status"/);
  assert.match(html, /name="player"/);
  assert.match(html, /<details class="week-group" open>/);
  assert.match(html, /1<\/strong> von 6 Spielen/);
  assert.match(html, /Alice vs\. Bob/);
});

test('renders admin filters and preserves them in match actions', async () => {
  const html = await ejs.renderFile(
    path.join(viewsDirectory, 'admin.ejs'),
    { ...createViewData(), isAuthenticated: true }
  );

  assert.match(html, /Offene Spiele/);
  assert.match(html, /\/result\?status=open&amp;week=2/);
  assert.match(html, /\/postpone\?status=open&amp;week=2/);
  assert.match(html, /\/delete\?status=open&amp;week=2/);
});
