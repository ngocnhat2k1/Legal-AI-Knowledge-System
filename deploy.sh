#!/usr/bin/env bash
# Server half of CD (.github/workflows/ci-cd.yml). CI builds the images; this host only pulls
# them, so a deploy never builds on a shared machine that has no swap.
#
# The CI deploy key runs this script as its forced command, so the key can do one thing: deploy
# the commit at the head of main. Line in the deploy user's ~/.ssh/authorized_keys:
#   restrict,command="<stack dir>/deploy.sh" ssh-ed25519 AAAA... customs-assistant-ci
# The ssh command line carries the commit SHA; stdin carries the job's short-lived GITHUB_TOKEN
# (packages:read) for the private images on ghcr.io.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

if [[ ${1:-} != --checked-out ]]; then
  sha=${SSH_ORIGINAL_COMMAND:-${1:-}}
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy.sh <full commit SHA>" >&2; exit 2; }
  # Head of main only: a leaked key cannot put any other commit (a fork's included) on the server.
  git fetch --quiet origin main
  if [[ $(git rev-parse origin/main) != "$sha" ]]; then
    echo "main has moved past $sha; the run for the newer commit deploys it"
    exit 0
  fi
  git checkout --quiet --force --detach "$sha"
  exec "$0" --checked-out "$sha" # continue with this script as of the deployed commit
fi
sha=$2

if docker compose version >/dev/null 2>&1; then dc=(docker compose); else dc=(docker-compose); fi
owner=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]([^/]+)/.*$#\1#' | tr '[:upper:]' '[:lower:]')
images=(customs-assistant:local customs-assistant-ingest:local legal-embedder:local)
old=$(docker image inspect -f '{{.Id}}' "${images[@]}" 2>/dev/null || true)

# A throwaway client config: on a shared host the user's ~/.docker/config.json may hold other logins.
DOCKER_CONFIG=$(mktemp -d)
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io -u "$owner" --password-stdin >/dev/null

# Retag to the :local names the compose file uses, so manual compose commands run what was deployed.
pull() {
  docker pull --quiet "ghcr.io/$owner/$1"
  docker tag "ghcr.io/$owner/$1" "$2"
  docker rmi "ghcr.io/$owner/$1" >/dev/null
}
pull "customs-assistant:$sha" customs-assistant:local
pull "customs-assistant-ingest:$sha" customs-assistant-ingest:local
pull "legal-embedder:$(git rev-parse HEAD:apps/embedder)" legal-embedder:local

if [[ -f DEPLOYED_COMMIT ]]; then
  "${dc[@]}" run --rm --no-deps migrate </dev/null
  # Recreates only the services whose image or .env changed; db keeps running.
  "${dc[@]}" up -d --no-deps embedder api zalo-bot ingest </dev/null
else
  # New host: the whole chain, db → migrate → seed → seed-legal (embeds the corpus, ~20 min) → api, bot.
  "${dc[@]}" up -d </dev/null
fi

api=$("${dc[@]}" ps -q api)
if [[ $(docker inspect -f '{{.Image}}' "$api") != "$(docker image inspect -f '{{.Id}}' customs-assistant:local)" ]]; then
  echo "api is not running the image just pulled" >&2
  exit 1
fi
port=$("${dc[@]}" port api 3000)
for _ in {1..30}; do
  if curl -fs "http://127.0.0.1:${port##*:}/health"; then
    echo
    echo "$sha" >DEPLOYED_COMMIT
    new=$(docker image inspect -f '{{.Id}}' "${images[@]}")
    # Previous images go, unless a container or a rollback tag still holds them.
    for id in $old; do grep -qxF "$id" <<<"$new" || docker rmi "$id" >/dev/null 2>&1 || true; done
    exit 0
  fi
  sleep 2
done
# Status only: this output lands in a public Actions log, and app logs can hold chat content (R14).
"${dc[@]}" ps >&2
echo "api /health did not return ok within 60 s" >&2
exit 1
