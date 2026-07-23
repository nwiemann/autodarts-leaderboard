const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMatchFilterSql,
  getRelevantMatchWeek,
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

test('selects the first regularly scheduled week for the public default', () => {
  const matches = [
    { week: 4, status: 'scheduled' },
    { week: 1, status: 'postponed' },
    { week: 3, status: 'scheduled' },
    { week: 2, status: 'played' }
  ];

  assert.equal(getRelevantMatchWeek(matches), 3);
});

test('falls back to the latest existing week when no regular match is open', () => {
  assert.equal(getRelevantMatchWeek([
    { week: 2, status: 'postponed' },
    { week: 5, status: 'played' },
    { week: 4, status: 'played' }
  ]), 5);
  assert.equal(getRelevantMatchWeek([]), null);
});
