# Torrent Helper - Docker OpenVPN + Transmission

### Purpose
Run Transmission behind a VPN tunnel on Docker, with a small TypeScript helper container that periodically removes completed torrents after they begin seeding.

### What it does
This project uses the [haugene/transmission-openvpn](https://hub.docker.com/r/haugene/transmission-openvpn/) image so Transmission only runs while OpenVPN has an active tunnel. The helper app talks to Transmission over RPC from a second container.

New installs persist haugene/Transmission configuration in the `trans-config` volume mounted at `/config`, and downloads remain on the `trans-data` NFS-backed volume mounted at `/data`. Existing installs may still have legacy Transmission configuration at `/data/transmission-home`; do not auto-copy that folder from NFS during routine upgrades.

The release hub is an additive local web app. It runs a NestJS API, Angular UI, and PostgreSQL cache in separate Docker services, using WatchMode's `/v1/releases` endpoint to cache release responses and project them into Monday-Sunday browser weeks.

### Getting Started
* Copy `.env.example` to `.env`.
* Add your VPN provider credentials and settings to `.env`.
* Add `WATCHMODE_API_KEY` to `.env` if you want to fetch streaming and TV release data.
* Add `TMDB_API_KEY` or `TMDB_READ_ACCESS_TOKEN` to `.env` if you want to fetch standard digital movie release dates.
* Confirm the `trans-data` NFS volume in `docker-compose.yml` points at the intended storage location.
* Review the [haugene documentation](https://haugene.github.io/docker-transmission-openvpn/) before changing provider-specific VPN settings.

### How to use it

Start the VPN and Transmission container first:

```bash
docker compose up -d torrentHost
```

Start the helper after `torrentHost` is healthy:

```bash
npm run build
docker compose up -d torrentHelper
```

Or start the full stack:

```bash
npm run build
docker compose up -d
```

Start only the release hub:

```bash
docker compose up -d releaseDb releaseApi releaseWeb
```

Open the release browser at `http://localhost:4200`. The API is available at `http://localhost:3001/api/health`.

Stop the stack:

```bash
docker compose down
```

### Torrent Cleanup
While running, this app will query Transmission torrents and immediately remove any torrents that have completed and begun seeding.

### Digital Release Hub
The release hub lets you choose a Monday-Sunday week and view cached digital releases grouped into Movies and TV. WatchMode powers streaming/TV rows, and TMDB can add provider-agnostic digital movie release dates. The app stores WatchMode fetch snapshots, TMDB digital movie weeks, normalized release rows, and raw response JSON in the local `release-db18` Postgres volume, not on the NFS-backed Transmission data volume.

Cache behavior:
* One WatchMode fetch is saved once and can warm every Monday-Sunday week represented in the response.
* TMDB digital movie weeks are cached separately and merged into the Movies section as `Digital release` rows.
* TMDB digital movies with a recent primary release date plus a popularity or vote-count signal are ranked first and labeled `Featured digital`; older catalog/re-release rows stay lower in the Movies list.
* Weekly browsing is a read-time projection over cached release dates, not a separate per-week copy of the WatchMode response.
* Past weeks freeze after a successful fetch.
* The current week refreshes after 24 hours.
* Future weeks refresh after 6 hours or when you click refresh.
* If WatchMode fails and cached data exists, the API returns stale cached data with a warning.

Provider filters:
* Click the `x` on a provider chip to hide that provider from the current browser.
* Hidden providers are stored in browser `localStorage`.
* Use the hidden provider filter strip to uncheck a provider and show it again.

Useful development commands:

```bash
npm --prefix apps/api test
npm --prefix apps/api run build
npm --prefix apps/web test
npm --prefix apps/web run build
```

If your host Node version is not supported by Prisma or Angular, run those commands through `node:22-alpine`, matching the Compose services.

### Peer and VPN Diagnostics
PIA port forwarding can assign a dynamic peer port, so fixed `51413` host mappings are intentionally not published by default. Check the actual active port and tracker/peer status with:

```bash
npm run diagnose
```

The diagnostic script reports container health, `tun0` tunnel presence, Transmission's peer-port status, torrent peer counts, tracker errors, and recent VPN/port-forward log signals without printing `.env` or expanded Compose configuration.

### Accessing Transmission WebUI
Once `torrentHost` is running and healthy, access the Transmission web interface at `http://localhost:9091/web`.

### Upgrade Notes
The Compose file pins `haugene/transmission-openvpn:5.4.1`. If this upgrade causes provider-specific trouble, roll the image back to `haugene/transmission-openvpn:5.3.2` and rerun the diagnostics before changing torrent clients or VPN container architecture.

If haugene logs a warning about `/data/transmission-home`, leave it alone during normal operation. Any migration from that legacy NFS-backed folder to `/config/transmission-home` should be planned separately and should not copy from the NFS-backed data volume during routine startup or verification.
