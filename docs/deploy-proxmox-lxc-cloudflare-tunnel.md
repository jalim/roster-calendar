# Deploy to Proxmox LXC + Cloudflare Tunnel

This guide deploys this Node/Express service into a lightweight LXC container on Proxmox and exposes it securely via a Cloudflare Tunnel.

Target hostname: `roster.lumu.au`

## Architecture

- Proxmox runs an LXC container (Debian or Ubuntu).
- The app runs as a `systemd` service inside the container.
- The app listens on `127.0.0.1:3000` (private, not exposed to LAN/WAN).
- `cloudflared` runs as a `systemd` service inside the container.
- Cloudflare Tunnel publishes:
  - `https://roster.lumu.au` → `http://127.0.0.1:3000`

## Prerequisites

- A Proxmox host with ability to create LXC containers
- A Cloudflare account with the `lumu.au` zone added
- Ability to create DNS records in Cloudflare

## 1) Create the LXC container (Proxmox)

In Proxmox UI:

- **CT OS**: Debian 12 (recommended) or Ubuntu 22.04/24.04
- **CPU/RAM**: 1 vCPU and 512MB–1GB RAM is plenty
- **Disk**: 4–8GB (more if you plan to persist lots of rosters)
- **Network**: DHCP or static IP on your LAN (no public inbound required)
- **Security**: unprivileged container recommended

Notes:

- You do **not** need to expose any ports from Proxmox. Cloudflare Tunnel makes outbound connections.

## 2) Base OS setup (inside the container)

Update packages:

```sh
apt update && apt -y upgrade
apt install -y ca-certificates curl gnupg git
```

## 3) Install Node.js (Node 20 LTS)

This project is started via `npm start` (which runs `node src/index.js`).

### Debian/Ubuntu via NodeSource

```sh
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list

apt update
apt install -y nodejs
node -v && npm -v
```

## 4) Deploy the app

### Create a dedicated service user

```sh
adduser --system --group --home /opt/roster-calendar roster-calendar
```

### Fetch the repo

```sh
mkdir -p /opt/roster-calendar
chown -R roster-calendar:roster-calendar /opt/roster-calendar

sudo -u roster-calendar git clone https://github.com/jalim/roster-calendar.git /opt/roster-calendar
```

### Install dependencies (production only)

```sh
cd /opt/roster-calendar
sudo -u roster-calendar npm ci --omit=dev
```

## 5) Configure environment variables

Create `/opt/roster-calendar/.env`:

```sh
cat > /opt/roster-calendar/.env <<'EOF'
# HTTP
PORT=3000

# Persistence (recommended for long-term use)
ROSTER_PERSIST_ENABLED=true
ROSTER_PERSIST_PATH=./data/roster-store.json

# Optional: enable IMAP polling (see README for full set)
# ROSTER_EMAIL_POLLING_ENABLED=true
EOF

chown roster-calendar:roster-calendar /opt/roster-calendar/.env
chmod 600 /opt/roster-calendar/.env
```

## 6) Run the app long-term with systemd

Create `/etc/systemd/system/roster-calendar.service`:

```sh
cat > /etc/systemd/system/roster-calendar.service <<'EOF'
[Unit]
Description=Roster Calendar (Node/Express)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=roster-calendar
Group=roster-calendar
WorkingDirectory=/opt/roster-calendar
EnvironmentFile=/opt/roster-calendar/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now roster-calendar
```

Verify locally:

```sh
curl -sS http://127.0.0.1:3000/health
systemctl status roster-calendar --no-pager
```

### Optional hardening: bind the app to loopback only

By default, Node will listen on all interfaces unless you bind explicitly.

Recommended approach:

- Bind to loopback in code: `app.listen(PORT, '127.0.0.1', ...)`
- OR enforce with firewall rules so only loopback can reach port 3000.

If you choose the code change, keep the Cloudflare Tunnel target as `http://127.0.0.1:3000`.

## 7) Install cloudflared

### Install from Cloudflare apt repo

```sh
apt install -y ca-certificates curl gpg

mkdir -p /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(. /etc/os-release && echo $VERSION_CODENAME) main" \
  > /etc/apt/sources.list.d/cloudflared.list

apt update
apt install -y cloudflared
cloudflared --version
```

## 8) Create the Cloudflare Tunnel

### Authenticate

```sh
cloudflared tunnel login
```

This prints a URL. Open it in your browser, pick your Cloudflare account, and authorize for `lumu.au`.

### Create and route

```sh
cloudflared tunnel create roster-calendar
cloudflared tunnel route dns roster-calendar roster.lumu.au
```

### Configure ingress

Find the tunnel UUID:

```sh
cloudflared tunnel list
```

Create `/etc/cloudflared/config.yml`:

```sh
TUNNEL_ID="$(cloudflared tunnel list | awk '/roster-calendar/{print $1; exit}')"
mkdir -p /etc/cloudflared

cat > /etc/cloudflared/config.yml <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /root/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: roster.lumu.au
    service: http://127.0.0.1:3000
  - service: http_status:404
EOF
```

Dry-run in foreground once:

```sh
cloudflared --config /etc/cloudflared/config.yml tunnel run
```

If it works, stop it and proceed to systemd.

## 9) Run cloudflared long-term with systemd

Create `/etc/systemd/system/cloudflared.service`:

```sh
cat > /etc/systemd/system/cloudflared.service <<'EOF'
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared --config /etc/cloudflared/config.yml tunnel run
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now cloudflared
```

Verify:

```sh
systemctl status cloudflared --no-pager
journalctl -u cloudflared -f
```

## 10) Cloudflare Access (recommended)

If you don’t want roster uploads to be public:

- Cloudflare Zero Trust → Access → Applications → Add
- Protect `roster.lumu.au`
- Require your preferred identity provider (Google/Microsoft/etc.)

This is a very strong default for “long-term” services.

## 11) Updates and maintenance

### Update the app

```sh
cd /opt/roster-calendar
sudo -u roster-calendar git pull
sudo -u roster-calendar npm ci --omit=dev
systemctl restart roster-calendar
```

### Check logs

```sh
journalctl -u roster-calendar -n 200 --no-pager
journalctl -u cloudflared -n 200 --no-pager
```

### Persistence / backups

If you enable persistence (`ROSTER_PERSIST_ENABLED=true`), the file at:

- `/opt/roster-calendar/data/roster-store.json`

becomes your key state.

Recommended:

- Add it to your Proxmox backup strategy.
- Or back it up independently (e.g. nightly rsync to NAS).
