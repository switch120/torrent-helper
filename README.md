# Torrent Helper - Docker OpenVPN + Transmission

### Purpose
Run Transmission behind a VPN tunnel on Docker, with a small TypeScript helper container that periodically removes completed torrents after they begin seeding.

### What it does
This project uses the [haugene/transmission-openvpn](https://hub.docker.com/r/haugene/transmission-openvpn/) image so Transmission only runs while OpenVPN has an active tunnel. The helper app talks to Transmission over RPC from a second container.

New installs persist haugene/Transmission configuration in the `trans-config` volume mounted at `/config`, and downloads remain on the `trans-data` NFS-backed volume mounted at `/data`. Existing installs may still have legacy Transmission configuration at `/data/transmission-home`; do not auto-copy that folder from NFS during routine upgrades.

### Getting Started
* Copy `.env.example` to `.env`.
* Add your VPN provider credentials and settings to `.env`.
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

Stop the stack:

```bash
docker compose down
```

### Torrent Cleanup
While running, this app will query Transmission torrents and immediately remove any torrents that have completed and begun seeding.

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
