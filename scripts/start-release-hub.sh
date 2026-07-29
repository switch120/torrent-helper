#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose)
release_services=(releaseDb releaseApi releaseWeb)

network_count_for_service() {
  local service="$1"
  local container_id

  container_id="$("${compose[@]}" ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    echo "missing"
    return
  fi

  docker inspect --format '{{ len .NetworkSettings.Networks }}' "$container_id" 2>/dev/null || echo "0"
}

detached_services=()
for service in "${release_services[@]}"; do
  network_count="$(network_count_for_service "$service")"
  if [[ "$network_count" == "0" ]]; then
    detached_services+=("$service")
  fi
done

"${compose[@]}" config --quiet

if (( ${#detached_services[@]} > 0 )); then
  echo "Recreating release services because Docker has detached network state: ${detached_services[*]}"
  "${compose[@]}" up -d --force-recreate "${release_services[@]}"
else
  "${compose[@]}" up -d "${release_services[@]}"
fi

echo "Release hub requested. Check status with: docker compose ps releaseDb releaseApi releaseWeb"
