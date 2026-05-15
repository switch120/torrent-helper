#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose)
service="${TORRENT_SERVICE:-torrentHost}"

echo "== Container status =="
"${compose[@]}" ps "$service"

container_id="$("${compose[@]}" ps -q "$service")"
if [[ -z "$container_id" ]]; then
  echo "torrentHost is not running. Start it with: docker compose up -d torrentHost"
  exit 1
fi

health="$(docker inspect --format '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}not-configured{{ end }}' "$container_id" 2>/dev/null || true)"
echo "health: ${health:-unknown}"

echo
echo "== VPN tunnel =="
"${compose[@]}" exec -T "$service" sh -lc '
set -eu
if ip link show tun0 >/dev/null 2>&1; then
  echo "tun0: present"
  ip -4 addr show dev tun0 | sed -n "s/.*inet \([^ ]*\).*/tun0_ipv4: \1/p"
else
  echo "tun0: missing"
fi
ip route show default | sed "s/^/default_route: /"
'

echo
echo "== Transmission session =="
"${compose[@]}" exec -T "$service" sh -lc '
set -eu
remote() {
  if [ -n "${TRANSMISSION_RPC_USERNAME:-}" ]; then
    transmission-remote 127.0.0.1:9091 --auth "${TRANSMISSION_RPC_USERNAME}:${TRANSMISSION_RPC_PASSWORD:-}" "$@"
  else
    transmission-remote 127.0.0.1:9091 "$@"
  fi
}

remote -si | sed -n "/Listenport/Ip;/Peer port/Ip;/Portforward/Ip;/Port is open/Ip;/Configuration directory/Ip;/Download directory/Ip;/Peer limit/Ip"
'

echo
echo "== Torrents =="
"${compose[@]}" exec -T "$service" sh -lc '
set -eu
remote() {
  if [ -n "${TRANSMISSION_RPC_USERNAME:-}" ]; then
    transmission-remote 127.0.0.1:9091 --auth "${TRANSMISSION_RPC_USERNAME}:${TRANSMISSION_RPC_PASSWORD:-}" "$@"
  else
    transmission-remote 127.0.0.1:9091 "$@"
  fi
}

remote -l || true
'

echo
echo "== Tracker and peer details =="
"${compose[@]}" exec -T "$service" sh -lc '
set -eu
remote() {
  if [ -n "${TRANSMISSION_RPC_USERNAME:-}" ]; then
    transmission-remote 127.0.0.1:9091 --auth "${TRANSMISSION_RPC_USERNAME}:${TRANSMISSION_RPC_PASSWORD:-}" "$@"
  else
    transmission-remote 127.0.0.1:9091 "$@"
  fi
}

remote -t all -i 2>/tmp/transmission-info.err | sed -n "/Name:/p;/State:/p;/Error:/p;/Tracker/p;/Peers:/p" || {
  sed "s/^/transmission-remote: /" /tmp/transmission-info.err
  true
}
'

echo
echo "== Recent VPN and port-forward log signals =="
"${compose[@]}" logs --no-log-prefix --tail=200 "$service" \
  | grep -Ei "Initialization Sequence Completed|Reserved Port|Port is open|^Port:|port has been bound|AUTH_FAILED|AEAD|TLS Error|SIGTERM|ERROR|WARN" \
  | tail -50 || true
