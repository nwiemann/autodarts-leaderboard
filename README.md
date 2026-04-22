# Autodarts Leaderboard

Kleine Liga-/Leaderboard-App für Autodarts mit Adminbereich, Match-Verwaltung und Tabellenansicht.

## Features

- Spieler anlegen
- Spieler aktivieren/deaktivieren
- Spieler löschen, wenn keine Matches vorhanden sind
- Matches anlegen
- Matches löschen
- Login-geschützter Adminbereich
- SQLite als Datenbank
- Docker-Setup für Deployment
- Betrieb hinter nginx Reverse Proxy möglich

## Tech-Stack

- Node.js
- Express
- EJS
- better-sqlite3
- Docker

## Lokaler Start ohne Docker

```bash
npm install
node server.js
```

Danach ist die App standardmäßig unter `http://localhost:3000` erreichbar.

## Start mit Docker

Image bauen:

```bash
docker build -t autodarts-app:latest .
```

Container starten:

```bash
docker run -d \
  --name autodarts_app \
  -p 3000:3000 \
  -e SESSION_SECRET=bitte-aendern \
  -e ADMIN_USER=admin \
  -e ADMIN_PASSWORD=bitte-aendern \
  -e DB_FILE=/app/data/league.db \
  -v autodarts_data:/app/data \
  autodarts-app:latest
```

## Start mit Docker Compose / Portainer

Beispiel:

```yaml
services:
  app:
    image: autodarts-app:latest
    container_name: autodarts_app
    restart: unless-stopped
    environment:
      PORT: 3000
      NODE_ENV: production
      SESSION_SECRET: ${SESSION_SECRET}
      ADMIN_USER: ${ADMIN_USER}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      DB_FILE: /app/data/league.db
      TRUST_PROXY: "true"
    volumes:
      - leaderboard_data:/app/data
    ports:
      - "127.0.0.1:3001:3000"

volumes:
  leaderboard_data:
```

## Wichtige Umgebungsvariablen

- `PORT` – Port der App im Container
- `SESSION_SECRET` – Secret für Sessions
- `ADMIN_USER` – Login-Benutzername für Admin
- `ADMIN_PASSWORD` – Login-Passwort für Admin
- `DB_FILE` – Pfad zur SQLite-Datei
- `TRUST_PROXY` – auf `true`, wenn die App hinter nginx läuft

## nginx Reverse Proxy Beispiel

```nginx
server {
    listen 80;
    server_name 192.168.10.12;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Danach nginx testen und neu laden:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Adminbereich

Admin-Login standardmäßig unter:

```text
/admin/login
```

## GitHub-Hinweis

Diese Dateien sollten **nicht** ins Repository:

- `.env`
- SQLite-Datenbankdateien (`*.db`)
- `data/`
- `node_modules/`

Dafür ist die `.gitignore` bereits vorbereitet.

## Lizenz

Nach Bedarf ergänzen.
