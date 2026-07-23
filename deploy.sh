#!/usr/bin/env bash

set -Eeuo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

container_name="${CONTAINER_NAME:-autodarts_app}"
volume_name="${DATA_VOLUME_NAME:-}"
compose_project="${COMPOSE_PROJECT_NAME:-}"
unmanaged_existing_container=false

for command_name in git docker; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Fehler: ${command_name} ist nicht installiert oder nicht im PATH." >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  echo "Fehler: Das Docker-Compose-Plugin (docker compose) ist nicht verfügbar." >&2
  exit 1
fi

# Bei einer bestehenden Portainer-Installation muss exakt dasselbe Volume
# weiterverwendet werden. Andernfalls würde Compose ein leeres Volume anlegen.
if docker container inspect "${container_name}" >/dev/null 2>&1; then
  detected_volume="$(
    docker container inspect \
      --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' \
      "${container_name}"
  )"

  if [[ -z "${detected_volume}" ]]; then
    echo "Fehler: Am Container ${container_name} wurde kein Docker-Volume für /app/data gefunden." >&2
    exit 1
  fi

  if [[ -n "${volume_name}" && "${volume_name}" != "${detected_volume}" ]]; then
    echo "Fehler: DATA_VOLUME_NAME=${volume_name}, der bestehende Container nutzt aber ${detected_volume}." >&2
    exit 1
  fi

  volume_name="${detected_volume}"

  detected_project="$(
    docker container inspect \
      --format '{{index .Config.Labels "com.docker.compose.project"}}' \
      "${container_name}"
  )"

  if [[ "${detected_project}" == "<no value>" ]]; then
    detected_project=""
  fi

  if [[ -n "${detected_project}" ]]; then
    if [[ -n "${compose_project}" && "${compose_project}" != "${detected_project}" ]]; then
      echo "Fehler: COMPOSE_PROJECT_NAME=${compose_project}, der bestehende Container gehört aber zu ${detected_project}." >&2
      exit 1
    fi
    compose_project="${detected_project}"
  else
    unmanaged_existing_container=true
  fi
else
  volume_name="${volume_name:-autodarts_leaderboard_data}"
fi

export DATA_VOLUME_NAME="${volume_name}"
export COMPOSE_PROJECT_NAME="${compose_project:-autodarts-leaderboard}"

echo "Verwende Daten-Volume: ${DATA_VOLUME_NAME}"
echo "Verwende Compose-Projekt: ${COMPOSE_PROJECT_NAME}"
echo "Hole den aktuellen Stand aus Git ..."
git pull --ff-only

# Validiert unter anderem, dass die Zugangsdaten in .env oder in der
# Shell-Umgebung gesetzt wurden. Dabei werden keine Secrets ausgegeben.
docker compose config --quiet

echo "Baue das neue Image ..."
docker compose build --pull app

if [[ "${unmanaged_existing_container}" == "true" ]]; then
  echo "Ersetze den bisher nicht von Compose verwalteten Container ..."
  docker container rm --force "${container_name}"
fi

echo "Starte die aktualisierte Anwendung ..."
docker compose up -d --remove-orphans app

docker compose ps app
