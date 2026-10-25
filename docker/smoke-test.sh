#!/usr/bin/env bash
# Builds the image, starts it, and checks what the deployment depends on.
#   docker/smoke-test.sh            # HTTP checks
#   BROWSER=1 docker/smoke-test.sh  # also drive it in headless Chromium (needs network; see plugin/README.md)
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=${IMAGE:-jbrowse2-smoke}
NAME=jbrowse2-smoke-$$
PORT=${SMOKE_PORT:-14891}
BUILD_ARGS=()
[ -n "${https_proxy:-}" ] && BUILD_ARGS+=(--build-arg "https_proxy=$https_proxy" --build-arg "http_proxy=${http_proxy:-$https_proxy}")

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

docker build "${BUILD_ARGS[@]}" -t "$IMAGE" . >/dev/null || fail "docker build"
ok "image builds"
docker run -d --name "$NAME" -p "$PORT:80" "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/config.json" >/dev/null && break
  sleep 1
done

base="http://localhost:$PORT"
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
hdrs() { curl -sI "$@"; }

[ "$(code "$base/")" = 200 ] || fail "index.html"
ok "index.html served at the site root"
[ "$(code "$base/jbrowse-plugin-intermine.umd.production.min.js")" = 200 ] || fail "plugin bundle"
ok "plugin bundle served"

json=$(curl -s "$base/config.json")
python3 - "$json" <<'PY' || fail "config.json content"
import json, sys
c = json.loads(sys.argv[1])
assert c["plugins"][0]["name"] == "InterMine"
assert {a["name"] for a in c["assemblies"]} >= {"humanmine-9606"}
assert c["aggregateTextSearchAdapters"] and c["tracks"]
PY
ok "config.json has the InterMine plugin, assemblies, tracks and text search"

hdrs "$base/" | grep -qi '^x-frame-options' && fail "X-Frame-Options is set; report pages could not iframe JBrowse 2"
ok "no X-Frame-Options (iframe-able)"
hdrs "$base/config.json" | grep -qi '^cache-control: no-cache' || fail "config.json must not be cached"
ok "config.json is revalidated"
hdrs "$base/config.json" | grep -qi '^access-control-allow-origin: \*' || fail "config.json CORS header"
ok "config.json is readable cross-origin"
asset=$(curl -s "$base/" | grep -o 'static/js/[^"]*\.js' | head -1)
[ -n "$asset" ] || fail "no static asset found in index.html"
hdrs "$base/$asset" | grep -qi '^cache-control:.*immutable' || fail "static assets should be cached"
ok "static assets are cached ($asset)"

for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME")" = healthy ] || fail "container not healthy"
ok "container healthcheck passes"

if [ -n "${BROWSER:-}" ]; then
  E2E_PORT=$PORT node plugin/e2e/run.mjs "${SMOKE_OUT:-test-screenshots/docker}" >/dev/null || fail "browser check against the container"
  ok "PAX6 tracks, sequence and name search work in the container (headless Chromium)"
fi
echo "all smoke checks passed"
