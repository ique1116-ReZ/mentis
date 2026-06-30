# Mentis Deployment Notes

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

Deploy application code:

```bash
cd /opt/mentis-rehab-platform
sudo -u mentis git clone YOUR_REPO_URL . || sudo -u mentis git pull
sudo -u mentis npm ci
sudo -u mentis npm run build -w @mentis/domain
sudo -u mentis npm run build -w @mentis/api
```

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
