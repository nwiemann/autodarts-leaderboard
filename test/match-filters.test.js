const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMatchFilterSql,
  getDefaultOpenWeek,
  groupMatchesByWeek,
  normalizeMatchFilters,
  serializeMatchFilters
} = require('../lib/match-filters');

test('normalizes valid match filters from URL parameters', () => {
  assert.deepEqual(
    normalizeMatchFilters({ week: '4', status: 'played', player: '12' }),
    { week: 4, status: 'played', player: 12 }
  );
});

test('rejects invalid values and applies the requested default status', () => {
  assert.deepEqual(
    normalizeMatchFilters({ week: '-1', status: 'unknown', player: 'Alice' }, 'open'),
    { week: 'all', status: 'open', player: 'all' }
  );
});

test('serializes filters for returning to the same admin selection', () => {
  assert.equal(
    serializeMatchFilters({ week: 3, status: 'postponed', player: 8 }),
    'status=postponed&week=3&player=8'
  );
});

test('builds a parameterized SQL filter for week, status and player', () => {
  assert.deepEqual(
    buildMatchFilterSql({ week: 2, status: 'played', player: 5 }),
    {
      whereClause: 'WHERE m.week = ? AND m.status = ? AND (m.home_player_id = ? OR m.away_player_id = ?)',
      params: [2, 'played', 5, 5]
    }
  );
});

test('maps the open filter to scheduled and postponed matches', () => {
  assert.deepEqual(
    buildMatchFilterSql({ week: 'all', status: 'open', player: 'all' }),
    {
      whereClause: "WHERE m.status IN ('scheduled', 'postponed')",
      params: []
    }
  );
});

test('keeps the unfiltered API query backward compatible', () => {
  assert.deepEqual(
    buildMatchFilterSql(normalizeMatchFilters({}, 'all')),
    { whereClause: '', params: [] }
  );
});

test('groups ordered matches by week', () => {
  const matches = [
    { id: 1, week: 1 },
    { id: 2, week: 1 },
    { id: 3, week: 2 }
  ];

  assert.deepEqual(groupMatchesByWeek(matches), [
    { week: 1, matches: [matches[0], matches[1]] },
    { week: 2, matches: [matches[2]] }
  ]);
});

test('opens a selected week or otherwise the first week with an open match', () => {
  const matches = [
    { week: 1, status: 'played' },
    { week: 2, status: 'scheduled' },
    { week: 3, status: 'postponed' }
  ];

  assert.equal(getDefaultOpenWeek(matches, 3), 3);
  assert.equal(getDefaultOpenWeek(matches, 'all'), 2);
  assert.equal(getDefaultOpenWeek([{ week: 4, status: 'played' }], 'all'), 4);
  assert.equal(getDefaultOpenWeek([], 'all'), null);
});
