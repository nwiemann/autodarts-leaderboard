'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateStandings } = require('../lib/standings');

const players = (...names) => names.map((name, i) => ({ id: i + 1, name }));
const played = (home, away, homeLegs, awayLegs, status = 'played') => ({
  home_player_id: home,
  away_player_id: away,
  home_legs: homeLegs,
  away_legs: awayLegs,
  status
});
const names = (result) => result.map((row) => row.name);

test('more table points always rank ahead of any direct-comparison result', () => {
  const result = calculateStandings(players('Anna', 'Bert', 'Clara'), [
    played(1, 2, 3, 0),
    played(2, 3, 3, 0),
    played(2, 3, 3, 1)
  ]);
  assert.deepEqual(names(result), ['Bert', 'Anna', 'Clara']);
  assert.equal(result[0].points, 4);
});

test('a direct win outranks a better overall leg difference (variant A)', () => {
  const result = calculateStandings(players('Anna', 'Bert', 'Clara', 'Dora'), [
    played(1, 2, 3, 2),
    played(2, 3, 3, 0),
    played(1, 4, 3, 2)
  ]);
  // Anna has 4 points here; compare Anna/Bert at 2 points with just one Anna win:
  assert.equal(result[0].name, 'Anna');
  const equal = calculateStandings(players('Anna', 'Bert', 'Clara'), [
    played(1, 2, 3, 2),
    played(2, 3, 3, 0)
  ]);
  assert.equal(equal[0].name, 'Anna');
  assert.equal(equal[1].name, 'Bert');
  assert.ok(equal[1].legDiff > equal[0].legDiff);
});

test('one win apiece: the legs from both encounters determine the order', () => {
  const result = calculateStandings(players('Anna', 'Bert'), [
    played(1, 2, 3, 0),
    played(2, 1, 3, 1)
  ]);
  assert.deepEqual(names(result), ['Anna', 'Bert']);
  assert.deepEqual(result.map((row) => row.legDiff), [1, -1]);
});

test('if no direct game exists, overall leg difference determines the tie', () => {
  const result = calculateStandings(players('Anna', 'Bert', 'Clara'), [
    played(3, 1, 3, 0),
    played(3, 2, 3, 2)
  ]);
  assert.deepEqual(names(result), ['Clara', 'Bert', 'Anna']);
});

test('when direct and overall leg differences tie, sort alphabetically', () => {
  assert.deepEqual(names(calculateStandings(players('Zoe', 'Anna'), [
    played(1, 2, 3, 0),
    played(2, 1, 3, 0)
  ])), ['Anna', 'Zoe']);
});

test('three-way tie uses mini-league head-to-head leg difference', () => {
  const result = calculateStandings(players('Anna', 'Bert', 'Clara'), [
    played(1, 2, 3, 0),
    played(2, 3, 3, 1),
    played(3, 1, 3, 2)
  ]);
  assert.deepEqual(result.map((row) => row.points), [2, 2, 2]);
  assert.deepEqual(names(result), ['Anna', 'Bert', 'Clara']);
});

test('works with four equally ranked players and ignores non-played games', () => {
  const ps = players('Anna', 'Bert', 'Clara', 'Dora');
  const results = [
    played(1, 2, 3, 0),
    played(2, 3, 3, 1),
    played(3, 4, 3, 2),
    played(4, 1, 3, 1),
    played(1, 3, 9, 0, 'scheduled'),
    played(2, 4, 9, 0, 'postponed')
  ];
  const ranked = calculateStandings(ps, results);
  assert.deepEqual(ranked.map((row) => row.points), [2, 2, 2, 2]);
  // A circular set of direct results is resolved deterministically via the mini-table.
  assert.deepEqual(names(ranked), ['Anna', 'Dora', 'Bert', 'Clara']);
  assert.deepEqual(ranked.map((row) => row.rank), [1, 2, 3, 4]);
});

test('supports five players with the same points and circular results', () => {
  const ranked = calculateStandings(players('Anna', 'Bert', 'Clara', 'Dora', 'Emil'), [
    played(1, 2, 3, 0),
    played(2, 3, 3, 0),
    played(3, 4, 3, 0),
    played(4, 5, 3, 0),
    played(5, 1, 3, 0)
  ]);
  assert.deepEqual(ranked.map((row) => row.points), [2, 2, 2, 2, 2]);
  assert.deepEqual(names(ranked), ['Anna', 'Bert', 'Clara', 'Dora', 'Emil']);
});

test('rank does not depend on match or player input order with partial schedule', () => {
  const ps = players('Anna', 'Bert', 'Clara');
  const results = [
    played(1, 2, 3, 2),
    played(2, 3, 3, 2),
    played(3, 1, 3, 2)
  ];
  const original = names(calculateStandings(ps, results));
  assert.deepEqual(names(calculateStandings([...ps].reverse(), [...results].reverse())), original);
});

test('wins, games, legs and 2 points per win are still calculated correctly', () => {
  const result = calculateStandings(players('Anna', 'Bert'), [played(1, 2, 3, 1)]);
  assert.deepEqual(result.map(({ name, played, wins, losses, legsFor, legsAgainst, legDiff, points }) =>
    ({ name, played, wins, losses, legsFor, legsAgainst, legDiff, points })), [
      { name: 'Anna', played: 1, wins: 1, losses: 0, legsFor: 3, legsAgainst: 1, legDiff: 2, points: 2 },
      { name: 'Bert', played: 1, wins: 0, losses: 1, legsFor: 1, legsAgainst: 3, legDiff: -2, points: 0 }
    ]);
});
