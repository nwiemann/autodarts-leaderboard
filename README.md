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

## Tests

Die automatisierten Tests prüfen den Admin-Login, den vollständigen Spieler- und
Match-CRUD-Ablauf mit einer isolierten In-Memory-SQLite-Datenbank, die Matchfilter,
die Wochen-Gruppierung, die Abwärtskompatibilität der ungefilterten API-Abfrage
und das Rendering der öffentlichen sowie der administrativen Ansicht:

```bash
npm test
```

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
      SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET muss gesetzt sein}
      ADMIN_USER: ${ADMIN_USER:?ADMIN_USER muss gesetzt sein}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:?ADMIN_PASSWORD muss gesetzt sein}
      DB_FILE: /app/data/league.db
      TRUST_PROXY: "true"
    volumes:
      - leaderboard_data:/app/data
    ports:
      - "127.0.0.1:3000:3000"

volumes:
  leaderboard_data:
    name: ${DATA_VOLUME_NAME:?DATA_VOLUME_NAME muss gesetzt sein}
```

## Einfaches Deployment auf dem Raspberry Pi

Für dieses Projekt ist kein Container-Registry-Workflow erforderlich. Das
Repository wird direkt auf dem Raspberry Pi ausgecheckt und dort gebaut.

Beim ersten Einsatz das Repository klonen und in den Projektordner wechseln:

```bash
git clone https://github.com/nwiemann/autodarts-leaderboard.git
cd autodarts-leaderboard
```

Danach eine nicht versionierte `.env`-Datei anlegen:

```dotenv
SESSION_SECRET=ein-langes-zufaelliges-secret
ADMIN_USER=admin
ADMIN_PASSWORD=ein-sicheres-passwort
```

Bei der Übernahme einer vorhandenen Installation müssen hier die bisherigen
Werte aus dem Portainer-Stack eingetragen werden. Insbesondere sollte
`ADMIN_USER` nicht unbeabsichtigt geändert werden; das Passwort wird nur beim
erstmaligen Anlegen eines Admin-Benutzers aus der Umgebungsvariable übernommen.

Das Deployment erfolgt anschließend mit:

```bash
chmod +x deploy.sh
./deploy.sh
```

Das Skript führt einen Fast-Forward-Git-Pull aus, prüft die Compose-Konfiguration,
baut das Image mit einem aktuellen Basis-Image und startet den App-Container neu.
Portainer kann weiterhin zur Anzeige von Logs, Status und Ressourcen verwendet
werden; das eigentliche Deployment erfolgt über das Skript.

### Übernahme eines bestehenden Portainer-Stacks

Wenn `autodarts_app` bereits läuft, erkennt das Skript automatisch das an
`/app/data` eingehängte Docker-Volume sowie den bisherigen Compose-Projektnamen
und verwendet beide weiter. Dadurch bleibt die vorhandene SQLite-Datenbank
erhalten und der Portainer-Container kann ohne Namenskonflikt aktualisiert
werden. Bei abweichenden, explizit gesetzten Variablen bricht das Skript
sicherheitshalber ab.

Falls der bestehende Container anders heißt, den Namen beim ersten Aufruf
angeben:

```bash
CONTAINER_NAME=anderer_container_name ./deploy.sh
```

Bei einer Neuinstallation verwendet das Skript standardmäßig das Volume
`autodarts_leaderboard_data`. Ein anderer Name kann bei Bedarf vorgegeben werden:

```bash
DATA_VOLUME_NAME=mein_leaderboard_volume ./deploy.sh
```

Der Stack sollte nach dieser Umstellung nicht zusätzlich über den Portainer
Stack-Editor neu ausgerollt werden. Andernfalls könnten Portainer und Compose mit
unterschiedlichen Projekt- oder Volume-Einstellungen arbeiten.

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
        proxy_pass http://127.0.0.1:3000;
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

## Produktionsupdate ohne Datenverlust

Die SQLite-Datenbank liegt im Docker-Volume `leaderboard_data` und nicht im
Anwendungs-Image. Ein neues Image kann deshalb ausgerollt werden, ohne Spieler,
Matches oder Ergebnisse zu überschreiben.

Vor jedem Update sollte trotzdem eine Sicherung der Datenbank erstellt werden:

```bash
docker stop autodarts_app
docker cp autodarts_app:/app/data/league.db ./league-backup.db
docker start autodarts_app
./deploy.sh
```

Beim Deployment über den Raspberry Pi genügt für das eigentliche Update:

```bash
./deploy.sh
```

Wichtig: `docker compose down -v` löscht das Volume und darf bei einem normalen
Update nicht verwendet werden.

Die Filterfunktion benötigt keine Änderung am Datenbankschema und ist vollständig
mit bestehenden `league.db`-Dateien kompatibel. Für zukünftige Schemaänderungen gilt:

- vor dem Deployment eine Sicherung der produktiven Datenbank erstellen
- Änderungen nur über nachvollziehbare, additive Migrationen einführen
- jede Migration zuerst mit einer Kopie der produktiven Datenbank testen
- bestehende Spalten und Datenformate nicht ohne gesonderten Migrationspfad entfernen

## Adminbereich

Admin-Login standardmäßig unter:

```text
/admin/login
```

## Lizenz

Nach Bedarf ergänzen.
