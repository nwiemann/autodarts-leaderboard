const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'league.db');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TRUST_PROXY = (process.env.TRUST_PROXY || '').toLowerCase() === 'true';

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week INTEGER NOT NULL,
      home_player_id INTEGER NOT NULL,
      away_player_id INTEGER NOT NULL,
      home_legs INTEGER,
      away_legs INTEGER,
      scheduled_date TEXT,
      played_at TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'played', 'postponed')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(home_player_id) REFERENCES players(id),
      FOREIGN KEY(away_player_id) REFERENCES players(id)
    );
  `);

  const existingAdmin = db.prepare('SELECT id FROM admins WHERE username = ?').get(ADMIN_USER);
  if (!existingAdmin) {
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(
      ADMIN_USER,
      hashPassword(ADMIN_PASSWORD)
    );
  }
}

initDb();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION,
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.isAuthenticated = Boolean(req.session.adminId);
  res.locals.adminUser = req.session.adminUser || null;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.adminId) {
    return res.redirect('/admin/login');
  }
  next();
}

function getPlayers() {
  return db.prepare('SELECT * FROM players ORDER BY LOWER(name) ASC').all();
}

function getMatches() {
  return db.prepare(`
    SELECT
      m.*,
      hp.name AS home_name,
      ap.name AS away_name
    FROM matches m
    JOIN players hp ON hp.id = m.home_player_id
    JOIN players ap ON ap.id = m.away_player_id
    ORDER BY m.week ASC, COALESCE(m.played_at, m.scheduled_date, m.created_at) ASC, m.id ASC
  `).all();
}

function getStandings() {
  const players = db.prepare('SELECT id, name FROM players WHERE is_active = 1 ORDER BY LOWER(name)').all();
  const playedMatches = db.prepare(`
    SELECT * FROM matches
    WHERE status = 'played' AND home_legs IS NOT NULL AND away_legs IS NOT NULL
  `).all();

  const table = players.map((player) => ({
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

  const byId = new Map(table.map((row) => [row.id, row]));

  for (const match of playedMatches) {
    const home = byId.get(match.home_player_id);
    const away = byId.get(match.away_player_id);
    if (!home || !away) continue;

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

  for (const row of table) {
    row.legDiff = row.legsFor - row.legsAgainst;
  }

  table.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.legDiff !== a.legDiff) return b.legDiff - a.legDiff;
    if (b.legsFor !== a.legsFor) return b.legsFor - a.legsFor;
    return a.name.localeCompare(b.name, 'de');
  });

  return table.map((row, index) => ({ rank: index + 1, ...row }));
}

app.get('/', (req, res) => {
  res.render('index', {
    standings: getStandings(),
    matches: getMatches(),
    players: getPlayers()
  });
});

app.get('/api/standings', (req, res) => {
  res.json(getStandings());
});

app.get('/api/matches', (req, res) => {
  res.json(getMatches());
});

app.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

  if (!admin || admin.password_hash !== hashPassword(password || '')) {
    return res.status(401).render('login', { error: 'Ungültige Zugangsdaten.' });
  }

  req.session.adminId = admin.id;
  req.session.adminUser = admin.username;
  res.redirect('/admin');
});

app.post('/admin/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/admin', requireAuth, (req, res) => {
  res.render('admin', {
    standings: getStandings(),
    matches: getMatches(),
    players: getPlayers(),
    success: req.query.success || '',
    error: req.query.error || ''
  });
});

app.post('/admin/players', requireAuth, (req, res) => {
  const name = (req.body.name || '').trim();
  if (name) {
    try {
      db.prepare('INSERT INTO players (name) VALUES (?)').run(name);
    } catch (error) {
      // ignore duplicates for now
    }
  }
  res.redirect('/admin');
});

app.post('/admin/players/:id/toggle', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const player = db.prepare('SELECT is_active FROM players WHERE id = ?').get(id);
  if (player) {
    db.prepare('UPDATE players SET is_active = ? WHERE id = ?').run(player.is_active ? 0 : 1, id);
  }
  res.redirect('/admin');
});

app.post('/admin/players/:id/delete', requireAuth, (req, res) => {
  const id = Number(req.params.id);

  const matchUsage = db.prepare(`
    SELECT COUNT(*) AS count
    FROM matches
    WHERE home_player_id = ? OR away_player_id = ?
  `).get(id, id);

  if (matchUsage.count > 0) {
    return res.redirect('/admin?error=player_has_matches');
  }

  db.prepare('DELETE FROM players WHERE id = ?').run(id);
  res.redirect('/admin?success=player_deleted');
});

app.post('/admin/matches', requireAuth, (req, res) => {
  const week = Number(req.body.week);
  const homePlayerId = Number(req.body.home_player_id);
  const awayPlayerId = Number(req.body.away_player_id);
  const scheduledDate = req.body.scheduled_date || null;
  const note = (req.body.note || '').trim() || null;

  if (week && homePlayerId && awayPlayerId && homePlayerId !== awayPlayerId) {
    db.prepare(`
      INSERT INTO matches (week, home_player_id, away_player_id, scheduled_date, note, status)
      VALUES (?, ?, ?, ?, ?, 'scheduled')
    `).run(week, homePlayerId, awayPlayerId, scheduledDate, note);
  }

  res.redirect('/admin');
});

app.post('/admin/matches/:id/result', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const homeLegs = Number(req.body.home_legs);
  const awayLegs = Number(req.body.away_legs);
  const playedAt = req.body.played_at || null;
  const note = (req.body.note || '').trim() || null;

  if (Number.isInteger(homeLegs) && Number.isInteger(awayLegs)) {
    db.prepare(`
      UPDATE matches
      SET home_legs = ?, away_legs = ?, played_at = ?, note = ?, status = 'played'
      WHERE id = ?
    `).run(homeLegs, awayLegs, playedAt, note, id);
  }

  res.redirect('/admin');
});

app.post('/admin/matches/:id/postpone', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const note = (req.body.note || '').trim() || 'Verschoben';
  db.prepare(`
    UPDATE matches
    SET status = 'postponed', note = ?
    WHERE id = ?
  `).run(note, id);
  res.redirect('/admin');
});

app.post('/admin/matches/:id/delete', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM matches WHERE id = ?').run(id);
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`Autodarts leaderboard läuft auf Port ${PORT}`);
  console.log(`Admin: ${ADMIN_USER}`);
});
