# Deploy to Proxmox LXC + VPS Reverse Proxy

This guide deploys the Node/Express service into a lightweight LXC container on Proxmox and exposes it via an nginx reverse proxy running on a VPS.

Target hostname: `roster.lumu.au`

## Architecture

- Proxmox runs an LXC container (Debian or Ubuntu).
- The app runs as a `systemd` service inside the container, listening on all interfaces (or just LAN IP).
- A VPS running nginx acts as the public-facing reverse proxy:
  - Terminates TLS
  - Forwards `https://roster.lumu.au` → `http://<LXC-LAN-IP>:3000`
  - Passes `X-Forwarded-For` and `X-Forwarded-Proto` headers

## Prerequisites

- A Proxmox host with ability to create LXC containers
- A VPS reachable from the internet with a public IP
- DNS for `roster.lumu.au` pointing to the VPS public IP
- TLS certificate on the VPS (Let's Encrypt via Certbot recommended)

---

## 1) Create the LXC container (Proxmox)

In Proxmox UI:

- **CT OS**: Debian 12 (recommended) or Ubuntu 22.04/24.04
- **CPU/RAM**: 1 vCPU and 512MB–1GB RAM is plenty
- **Disk**: 4–8GB (more if you plan to persist lots of rosters)
- **Network**: Static LAN IP recommended (e.g. `192.168.1.50`)
- **Security**: unprivileged container recommended

Note the LAN IP — you'll need it when configuring nginx on the VPS.

---

## 2) Base OS setup (inside the container)

```sh
apt update && apt -y upgrade
apt install -y ca-certificates curl gnupg git
```

---

## 3) Install Node.js (Node 20 LTS)

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

---

## 4) Deploy the app (inside the container)

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

---

## 5) Configure environment variables (inside the container)

Create `/opt/roster-calendar/.env`:

```sh
cat > /opt/roster-calendar/.env <<'EOF'
PORT=3000
NODE_ENV=production

# IP of the VPS that proxies to this container
TRUSTED_PROXY=<VPS-PUBLIC-IP>

# Persistence
ROSTER_PERSIST_ENABLED=true
ROSTER_PERSIST_PATH=./data/roster-store.json

# Optional: enable IMAP polling (see README for full set)
# ROSTER_EMAIL_POLLING_ENABLED=true
EOF

chown roster-calendar:roster-calendar /opt/roster-calendar/.env
chmod 600 /opt/roster-calendar/.env
```

Replace `<VPS-PUBLIC-IP>` with the actual public IP of your VPS. This tells Express to trust `X-Forwarded-For` / `X-Forwarded-Proto` headers only from that source.

---

## 6) Run the app with systemd (inside the container)

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

### Firewall: restrict port 3000 to the VPS only

Allow the VPS to reach port 3000, deny everything else:

```sh
apt install -y ufw
ufw default deny incoming
ufw allow from <VPS-PUBLIC-IP> to any port 3000
ufw allow ssh
ufw enable
```

---

## 7) Configure nginx on the VPS

Install nginx and Certbot:

```sh
apt update
apt install -y nginx certbot python3-certbot-nginx
```

Obtain a TLS certificate:

```sh
certbot --nginx -d roster.lumu.au
```

Create `/etc/nginx/sites-available/roster-calendar`:

```nginx
server {
    listen 80;
    server_name roster.lumu.au;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name roster.lumu.au;

    ssl_certificate     /etc/letsencrypt/live/roster.lumu.au/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/roster.lumu.au/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass         http://<LXC-LAN-IP>:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }
}
```

Replace `<LXC-LAN-IP>` with the container's LAN IP (e.g. `192.168.1.50`).

Enable and reload:

```sh
ln -s /etc/nginx/sites-available/roster-calendar /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Verify end-to-end:

```sh
curl -sS https://roster.lumu.au/health
```

---

## 8) Updates and maintenance

### Update the app (inside the container)

```sh
cd /opt/roster-calendar
sudo -u roster-calendar git pull
sudo -u roster-calendar npm ci --omit=dev
systemctl restart roster-calendar
```

### Check logs

```sh
# App logs
journalctl -u roster-calendar -n 200 --no-pager

# Follow live
journalctl -u roster-calendar -f
```

Temporarily increase log verbosity by adding to `.env`:

```text
ROSTER_LOG_LEVEL=debug
ROSTER_HTTP_LOGGING=true
```

### Persistence / backups

If persistence is enabled (`ROSTER_PERSIST_ENABLED=true`), the state file is at:

```
/opt/roster-calendar/data/roster-store.json
```

Recommended:

- Add it to your Proxmox backup strategy.
- Or back it up independently (e.g. nightly rsync to NAS or VPS).
