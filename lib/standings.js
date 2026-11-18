'use strict';

function compareNames(a, b) {
  return a.name.localeCompare(b.name, 'de') || a.id - b.id;
}

function compareOverall(a, b) {
  return b.legDiff - a.legDiff || compareNames(a, b);
}

// For equally ranked players, only their matches against the other members
// of that points-tie group count towards the head-to-head mini-league.
function rankPointsTie(group, playedMatches) {
  if (group.length < 2) return group;

  const members = new Set(group.map((row) => row.id));
  const direct = new Map(group.map((row) => [row.id, { wins: 0, legDiff: 0 }]));
  const encountered = new Set();
  const pairKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;

  for (const match of playedMatches) {
    const homeId = match.home_player_id;
    const awayId = match.away_player_id;
    if (!members.has(homeId) || !members.has(awayId)) continue;

    encountered.add(pairKey(homeId, awayId));
    const home = direct.get(homeId);
    const away = direct.get(awayId);
    const legDifference = match.home_legs - match.away_legs;
    home.legDiff += legDifference;
    away.legDiff -= legDifference;
    if (legDifference > 0) home.wins += 1;
    if (legDifference < 0) away.wins += 1;
  }

  // A pair with no encounter falls back directly to the overall leg
  // difference. An in-progress round robin can otherwise produce cycles
  // (A > B, B > C, C > A). Resolve such cycles deterministically using
  // the mini-league, then the overall difference, then the name.
  const rows = [...group].sort(compareNames);
  const n = rows.length;
  const beats = Array.from({ length: n }, () => Array(n).fill(false));
  const compareMini = (a, b) => {
    const x = direct.get(a.id);
    const y = direct.get(b.id);
    return y.wins - x.wins || y.legDiff - x.legDiff || compareOverall(a, b);
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = rows[i];
      const b = rows[j];
      const compared = encountered.has(pairKey(a.id, b.id))
        ? compareMini(a, b)
        : compareOverall(a, b);
      if (compared < 0) beats[i][j] = true;
      else beats[j][i] = true;
    }
  }

  // Group mutually reachable players: cyclic preferences cannot all be
  // satisfied simultaneously, but the final ordering must be reproducible.
  const reachable = beats.map((line, i) => line.map((edge, j) => edge || i === j));
  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (reachable[i][k] && reachable[k][j]) reachable[i][j] = true;
      }
    }
  }

  const seen = new Set();
  const components = [];
  for (let i = 0; i < n; i += 1) {
    if (seen.has(i)) continue;
    const component = [];
    for (let j = 0; j < n; j += 1) {
      if (reachable[i][j] && reachable[j][i]) {
        component.push(j);
        seen.add(j);
      }
    }
    components.push(component);
  }

  // Edges between strongly connected components have a consistent direction.
  components.sort((a, b) => beats[a[0]][b[0]] ? -1 : 1);
  return components.flatMap((component) => component.map((i) => rows[i]).sort(compareMini));
}

function calculateStandings(players, matches) {
  const rows = players.map((player) => ({
    id: player.id,
    name: player.name,
    played: 0,
    wins: 0,
    losses: 0,
    legsFor: 0,
    legsAgainst: 0,
    legDiff: 0,
    points: 0
  }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const playedMatches = [];

  for (const match of matches) {
    if (match.status !== 'played' ||
        !Number.isInteger(match.home_legs) ||
        !Number.isInteger(match.away_legs)) continue;

    const home = byId.get(match.home_player_id);
    const away = byId.get(match.away_player_id);
    if (!home || !away) continue;
    playedMatches.push(match);

    home.played += 1;
    away.played += 1;
    home.legsFor += match.home_legs;
    home.legsAgainst += match.away_legs;
    away.legsFor += match.away_legs;
    away.legsAgainst += match.home_legs;

    if (match.home_legs > match.away_legs) {
      home.wins += 1;
      away.losses += 1;
      home.points += 2;
    } else if (match.away_legs > match.home_legs) {
      away.wins += 1;
      home.losses += 1;
      away.points += 2;
    }
  }

  for (const row of rows) row.legDiff = row.legsFor - row.legsAgainst;

  const byPoints = new Map();
  for (const row of rows) {
    if (!byPoints.has(row.points)) byPoints.set(row.points, []);
    byPoints.get(row.points).push(row);
  }

  const ranked = [...byPoints.keys()].sort((a, b) => b - a)
    .flatMap((points) => rankPointsTie(byPoints.get(points), playedMatches));
  return ranked.map((row, index) => ({ rank: index + 1, ...row }));
}

module.exports = { calculateStandings };
