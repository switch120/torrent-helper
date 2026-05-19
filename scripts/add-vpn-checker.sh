#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose)
service="${TORRENT_SERVICE:-torrentHost}"
magnet="magnet:?xt=urn:btih:ba9ebee7b8ce4cda531d8242b0f960aef06a342a&dn=WhatIsMyIP.net"

container_id="$("${compose[@]}" ps -q "$service")"
if [[ -z "$container_id" ]]; then
  echo "torrentHost is not running. Start it with: docker compose up -d torrentHost"
  exit 1
fi

"${compose[@]}" exec -T -e VPN_CHECKER_MAGNET="$magnet" "$service" sh -lc '
set -eu

remote() {
  if [ -n "${TRANSMISSION_RPC_USERNAME:-}" ]; then
    transmission-remote 127.0.0.1:9091 --auth "${TRANSMISSION_RPC_USERNAME}:${TRANSMISSION_RPC_PASSWORD:-}" "$@"
  else
    transmission-remote 127.0.0.1:9091 "$@"
  fi
}

if remote -l | grep -qi "WhatIsMyIP.net"; then
  echo "VPN checker torrent already exists in Transmission."
  exit 0
fi

remote --download-dir /data --add "$VPN_CHECKER_MAGNET"
echo "VPN checker torrent added. Open Downloads in the release hub to verify proxy health."
'
