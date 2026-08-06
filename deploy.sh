#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
COMPOSE_FILE="$ROOT/docker-compose.yml"
WEB_DIR="$ROOT/src/Steeple.Web.v2"

required_commands=(docker dotnet npm node curl)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

# Resolve tools before running anything in the repository. Some local environment hooks
# alter PATH when entering this project, so child processes should not depend on it.
DOCKER="$(command -v docker)"
DOTNET="$(command -v dotnet)"
NPM="$(command -v npm)"
NODE="$(command -v node)"
CURL="$(command -v curl)"

selected_ports=()

valid_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535))
}

port_is_available() {
  local port="$1"

  # Probe both loopback families. Binding a temporary socket is not reliable on macOS,
  # where SO_REUSEPORT can make an occupied port appear available.
  "$NODE" -e '
    const net = require("net");
    const port = Number(process.argv[1]);
    let pending = 2;
    let occupied = false;

    for (const host of ["127.0.0.1", "::1"]) {
      const socket = net.createConnection({ host, port });
      let settled = false;
      const finish = (connected) => {
        if (settled) return;
        settled = true;
        occupied ||= connected;
        socket.destroy();
        if (--pending === 0) process.exit(occupied ? 1 : 0);
      };
      socket.setTimeout(200);
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.once("timeout", () => finish(false));
    }
  ' "$port"
}

port_is_selected() {
  local candidate="$1"
  local selected
  # Bash 3.2 (the macOS system Bash) treats an empty array expansion as unset
  # under `set -u`. The conditional expansion keeps the loop empty there.
  for selected in "${selected_ports[@]+"${selected_ports[@]}"}"; do
    [[ "$candidate" == "$selected" ]] && return 0
  done
  return 1
}

select_port() {
  local name="$1"
  local default_port="$2"
  local explicit_port="$3"
  local candidate="${explicit_port:-$default_port}"

  if ! valid_port "$candidate"; then
    echo "$name port must be an integer from 1 to 65535; got '$candidate'." >&2
    exit 1
  fi

  if [[ -n "$explicit_port" ]]; then
    if port_is_selected "$candidate" || ! port_is_available "$candidate"; then
      echo "$name port $candidate was explicitly requested but is already in use." >&2
      exit 1
    fi
  else
    while port_is_selected "$candidate" || ! port_is_available "$candidate"; do
      ((candidate++))
      if ((candidate > 65535)); then
        echo "Could not find a free port for $name." >&2
        exit 1
      fi
    done
    if [[ "$candidate" != "$default_port" ]]; then
      echo "$name port $default_port is in use; using $candidate."
    fi
  fi

  selected_ports+=("$candidate")
  REPLY="$candidate"
}

# Reuse this Compose project's running database. Otherwise, choose a free port like the
# host processes below. An explicit override always means "use exactly this port."
existing_postgres_endpoint="$("$DOCKER" compose --env-file /dev/null -f "$COMPOSE_FILE" port postgres 5432 2>/dev/null | head -n 1 || true)"
existing_postgres_port="${existing_postgres_endpoint##*:}"
requested_postgres_port="${STEEPLE_POSTGRES_PORT:-}"
if [[ -n "$existing_postgres_endpoint" ]] && valid_port "$existing_postgres_port" &&
   { [[ -z "$requested_postgres_port" ]] || [[ "$requested_postgres_port" == "$existing_postgres_port" ]]; }; then
  POSTGRES_PORT="$existing_postgres_port"
  selected_ports+=("$POSTGRES_PORT")
else
  select_port "Postgres" 5433 "$requested_postgres_port"
  POSTGRES_PORT="$REPLY"
fi

select_port "API" 5200 "${STEEPLE_API_PORT:-}"
API_PORT="$REPLY"
select_port "Admin" 5198 "${STEEPLE_ADMIN_PORT:-}"
ADMIN_PORT="$REPLY"
select_port "Web" 5173 "${STEEPLE_WEB_PORT:-}"
WEB_PORT="$REPLY"

API_URL="http://localhost:$API_PORT"
ADMIN_URL="http://localhost:$ADMIN_PORT"
WEB_URL="http://localhost:$WEB_PORT"
DB_CONNECTION="Host=localhost;Port=$POSTGRES_PORT;Database=steeple;Username=steeple;Password=steeple_dev_pw"

compose() {
  # The Development loop deliberately uses the checked-in local defaults. In particular,
  # it must not accidentally inherit production credentials from a repository .env file.
  POSTGRES_USER=steeple \
  POSTGRES_PASSWORD=steeple_dev_pw \
  POSTGRES_DB=steeple \
  POSTGRES_PORT="$POSTGRES_PORT" \
    "$DOCKER" compose --env-file /dev/null -f "$COMPOSE_FILE" "$@"
}

echo "Preparing Postgres and applying Liquibase changes..."
compose stop api web admin >/dev/null
compose up -d postgres migrate
compose wait migrate

if [[ ! -x "$WEB_DIR/node_modules/.bin/vite" ]]; then
  echo "Installing Web v2 dependencies..."
  "$NPM" ci --prefix "$WEB_DIR"
fi

pids=()
names=()

cleanup() {
  trap - EXIT INT TERM
  if ((${#pids[@]})); then
    echo
    echo "Stopping Development app processes..."
    for pid in "${pids[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
    for pid in "${pids[@]}"; do
      wait "$pid" 2>/dev/null || true
    done
  fi
  echo "Postgres remains available on 127.0.0.1:$POSTGRES_PORT."
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting API, Admin, and Web v2..."
env ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS="$API_URL" \
  ConnectionStrings__SteepleDb="$DB_CONNECTION" \
  Media__PublicBaseUrl="$API_URL" Email__WebBaseUrl="$WEB_URL" \
  "$DOTNET" run --no-launch-profile --project "$ROOT/src/Steeple.Api" &
pids+=("$!")
names+=("API")

env ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS="$ADMIN_URL" \
  ConnectionStrings__SteepleDb="$DB_CONNECTION" Admin__MediaImageOrigins="https: $API_URL" \
  "$DOTNET" run --no-launch-profile --project "$ROOT/src/Steeple.Admin" &
pids+=("$!")
names+=("Admin")

env STEEPLE_API_ORIGIN="$API_URL" \
  "$NPM" run dev --prefix "$WEB_DIR" -- --host 127.0.0.1 --port "$WEB_PORT" --strictPort &
pids+=("$!")
names+=("Web v2")

all_processes_running() {
  local index
  for index in "${!pids[@]}"; do
    if ! kill -0 "${pids[$index]}" 2>/dev/null; then
      local status=0
      wait "${pids[$index]}" || status=$?
      echo "${names[$index]} stopped (exit $status); stopping the Development stack." >&2
      return 1
    fi
  done
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempts=60
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if "$CURL" --fail --silent --show-error --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    all_processes_running || return 1
    sleep 1
  done

  echo "$name did not become ready at $url within ${attempts}s." >&2
  return 1
}

wait_for_url "API" "$API_URL/health"
wait_for_url "Admin" "$ADMIN_URL/health"
wait_for_url "Web v2" "$WEB_URL/"

echo
echo "Steeple Development stack is ready:"
echo "  Web v2:  $WEB_URL"
echo "  Admin:   $ADMIN_URL/admin"
echo "  API:     $API_URL"
echo "  Mailbox: $API_URL/dev/mailbox"
echo
echo "Press Ctrl-C to stop API, Admin, and Web v2."

while true; do
  all_processes_running || exit 1
  sleep 1
done
