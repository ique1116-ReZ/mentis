# Mentis Deployment Notes

For the day-to-day "how do I ship a change" runbook (SSH coordinates, release/symlink steps, required env vars), see `../DEPLOY.md`. This file is the deeper one-time bootstrap reference for setting up a brand-new server from scratch.

## Target Shape

- Web: GitHub Pages.
- API: lightweight server `43.167.196.40`, behind Nginx + HTTPS.
- Recommended DNS:
  - `aimentis.site` -> GitHub Pages custom domain.
  - `www.aimentis.site` -> GitHub Pages custom domain.
  - `api.aimentis.site` -> A record to `43.167.196.40`.

GitHub Pages is HTTPS. The API should also be HTTPS, otherwise browser requests from the web app can be blocked as mixed content.

## GitHub Pages Settings

In the GitHub repository:

1. Settings -> Pages -> Build and deployment -> Source: GitHub Actions.
2. Settings -> Secrets and variables -> Actions -> Variables:
  - `VITE_API_BASE=https://api.aimentis.site`
   - `VITE_BASE_PATH=/`

If you deploy without a custom domain under `https://OWNER.github.io/REPO/`, set:

- `VITE_BASE_PATH=/REPO/`

## Server Bootstrap Outline

Run on `43.167.196.40` after SSH login:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx git
sudo useradd --system --create-home --shell /usr/sbin/nologin mentis || true
sudo mkdir -p /opt/mentis-rehab-platform
sudo chown -R mentis:mentis /opt/mentis-rehab-platform
```

Install Node.js 24 LTS or a compatible Node.js version before running the API.

Deploy application code as a new timestamped release, then flip the `current` symlink:

```bash
RELEASE=/opt/mentis-rehab-platform/releases/$(date +%Y%m%d%H%M)-$(git rev-parse --short HEAD)
sudo -u mentis mkdir -p "$RELEASE"
sudo -u mentis git clone --depth 1 YOUR_REPO_URL "$RELEASE"
cd "$RELEASE"
sudo -u mentis npm ci
sudo -u mentis npm run build -w @mentis/domain
sudo -u mentis npm run build -w @mentis/api
sudo -u mentis ln -sfn "$RELEASE" /opt/mentis-rehab-platform/current
sudo systemctl restart mentis-api
sudo systemctl status mentis-api --no-pager
```

Secrets are provided via a systemd drop-in (never commit these — check with `sudo systemctl cat mentis-api` to see what's already configured before overwriting):

```bash
sudo systemctl edit mentis-api
```

```ini
[Service]
Environment=DASHSCOPE_API_KEY=sk-...
Environment=DASHSCOPE_MODEL=qwen3.7-plus
Environment=DASHSCOPE_TIMEOUT_MS=60000
Environment=MENTIS_DEMO_USERNAME=...
Environment=MENTIS_DEMO_PASSWORD=...
Environment=MENTIS_CLINICIAN_DEMO_USERNAME=clinician_demo
Environment=MENTIS_CLINICIAN_DEMO_PASSWORD=change-me
Environment=MENTIS_ADMIN_DEMO_USERNAME=admin_demo
Environment=MENTIS_ADMIN_DEMO_PASSWORD=change-me
```

In production, `MENTIS_CLINICIAN_DEMO_USERNAME/PASSWORD` and `MENTIS_ADMIN_DEMO_USERNAME/PASSWORD` are required — the server refuses to start with the built-in dev defaults (`clinician_demo`/`mentis_clinician`, `admin_demo`/`mentis_admin`) when `NODE_ENV=production`. Pick real passwords here.

The API persists all runtime state (users, cases, consultations, chat memory) to `MENTIS_DATA_FILE` (`/opt/mentis-rehab-platform/data/platform-state.json` per the unit file) so a restart, crash, or release swap doesn't wipe data. That path deliberately lives outside `releases/*` so it survives every new release directory.

Install systemd service:

```bash
sudo cp infra/server/mentis-api.service /etc/systemd/system/mentis-api.service
sudo sed -i 's#https://YOUR_WEB_DOMAIN#https://aimentis.site#g' /etc/systemd/system/mentis-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now mentis-api
sudo systemctl status mentis-api --no-pager
```

Install Nginx reverse proxy:

```bash
sudo cp infra/server/nginx-mentis-api.conf /etc/nginx/sites-available/mentis-api
sudo sed -i 's/api.YOUR_DOMAIN/api.aimentis.site/g' /etc/nginx/sites-available/mentis-api
sudo ln -sf /etc/nginx/sites-available/mentis-api /etc/nginx/sites-enabled/mentis-api
sudo nginx -t
sudo systemctl reload nginx
```

Issue HTTPS certificate:

```bash
sudo certbot --nginx -d api.aimentis.site
```

Health check:

```bash
curl https://api.aimentis.site/health
```
