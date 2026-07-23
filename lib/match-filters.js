const ALLOWED_STATUSES = new Set(['all', 'open', 'scheduled', 'played', 'postponed']);

function normalizeMatchFilters(query = {}, defaultStatus = 'all') {
  const requestedStatus = String(query.status || '').toLowerCase();
  const week = Number(query.week);
  const playerId = Number(query.player);

  return {
    week: Number.isInteger(week) && week > 0 ? week : 'all',
    status: ALLOWED_STATUSES.has(requestedStatus) ? requestedStatus : defaultStatus,
    player: Number.isInteger(playerId) && playerId > 0 ? playerId : 'all'
  };
}

function serializeMatchFilters(filters) {
  const params = new URLSearchParams();
  params.set('status', filters.status);
  if (Number.isInteger(filters.week)) params.set('week', String(filters.week));
  if (Number.isInteger(filters.player)) params.set('player', String(filters.player));
  return params.toString();
}

function buildMatchFilterSql(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.week !== 'all' && Number.isInteger(filters.week)) {
    conditions.push('m.week = ?');
    params.push(filters.week);
  }

  if (filters.status === 'open') {
    conditions.push("m.status IN ('scheduled', 'postponed')");
  } else if (['scheduled', 'played', 'postponed'].includes(filters.status)) {
    conditions.push('m.status = ?');
    params.push(filters.status);
  }

  if (filters.player !== 'all' && Number.isInteger(filters.player)) {
    conditions.push('(m.home_player_id = ? OR m.away_player_id = ?)');
    params.push(filters.player, filters.player);
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

function getRelevantMatchWeek(matches) {
  const scheduledWeeks = matches
    .filter((match) => match.status === 'scheduled' && Number.isInteger(match.week))
    .map((match) => match.week);
  if (scheduledWeeks.length) return Math.min(...scheduledWeeks);

  const existingWeeks = matches
    .filter((match) => Number.isInteger(match.week))
    .map((match) => match.week);
  return existingWeeks.length ? Math.max(...existingWeeks) : null;
}

module.exports = {
  buildMatchFilterSql,
  getRelevantMatchWeek,
  normalizeMatchFilters,
  serializeMatchFilters
};
