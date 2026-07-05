# Deploy Runbook

Read this before touching production. It's the "how do I actually ship this"
cheat sheet; `infra/server/README.md` has the deeper one-time bootstrap notes
(DNS, Nginx, certbot) for standing up a brand-new server.

## Coordinates

- Web: GitHub Pages, custom domain `aimentis.site` / `www.aimentis.site`.
- API server: `43.167.196.40` (DNS: `api.aimentis.site` -> A record to this IP).
- SSH: `ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40`
  - Private key lives at `/Users/rez/Documents/claw.pem` on this Mac only. Never copy its contents into the repo, a commit, or a chat message.
  - Login user is `ubuntu`; the app itself runs as the unprivileged `mentis` system user (`sudo -u mentis ...` for anything touching `/opt/mentis-rehab-platform`).
- GitHub repo: `https://github.com/ique1116-ReZ/mentis.git`, default branch `main`.

## Frontend deploy

Fully automatic. Nothing to SSH for.

```bash
git push origin main
```

Pushing to `main` triggers `.github/workflows/deploy-web.yml`, which builds
`@mentis/web` with `VITE_API_BASE=https://api.aimentis.site` and publishes to
GitHub Pages. Watch it with:

```bash
curl -s "https://api.github.com/repos/ique1116-ReZ/mentis/actions/runs?per_page=1" \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['workflow_runs'][0]; print(r['status'], r['conclusion'], r['head_sha'][:7])"
```

Verify: `curl -s -o /dev/null -w '%{http_code}\n' https://aimentis.site/` should be `200`, and the JS bundle hash in the served HTML (`assets/index-*.js`) should change per deploy.

## Backend deploy

The server uses a release-directory + symlink layout (not a plain `git pull`
in place):

```
/opt/mentis-rehab-platform/
  current -> releases/<YYYYMMDDHHMM>-<shortsha>/   # symlink, what systemd runs
  releases/<YYYYMMDDHHMM>-<shortsha>/               # one full checkout per deploy
  data/platform-state.json                          # persisted state, OUTSIDE releases/
```

Steps (from the Mac, driving over SSH):

```bash
SHA=$(git rev-parse --short HEAD)   # deploy whatever commit you just pushed
ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40 "
  set -e
  RELEASE=/opt/mentis-rehab-platform/releases/\$(date +%Y%m%d%H%M)-$SHA
  sudo -u mentis git clone --depth 1 https://github.com/ique1116-ReZ/mentis.git \"\$RELEASE\"
  cd \"\$RELEASE\"
  sudo -u mentis npm ci
  sudo -u mentis npm run build -w @mentis/domain
  sudo -u mentis npm run build -w @mentis/api
  sudo -u mentis ln -sfn \"\$RELEASE\" /opt/mentis-rehab-platform/current
  sudo systemctl restart mentis-api
  sudo systemctl status mentis-api --no-pager
"
```

Then verify from the Mac (not just `systemctl status` — confirm it actually answers):

```bash
curl -s https://api.aimentis.site/health
curl -s -o /dev/null -w '%{http_code}\n' https://api.aimentis.site/v1/users/user_1/memory   # expect 401, not 200
```

If the new release fails to come up, roll back by re-pointing the symlink at
the previous `releases/*` directory and restarting — nothing needs rebuilding
since the old release dir is untouched:

```bash
ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40 "
  sudo -u mentis ln -sfn /opt/mentis-rehab-platform/releases/<previous-dir> /opt/mentis-rehab-platform/current
  sudo systemctl restart mentis-api
"
```

Node on the server is v18.19.1 (global `crypto.randomUUID()` works there —
verified). `npm ci` will print `EBADENGINE` warnings about vite/plugin-react
wanting Node 20+; ignore them, the web app is never built on this server.

## Secrets and required env vars

Nothing is committed. Everything comes from a systemd drop-in:

```bash
ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40 "sudo systemctl cat mentis-api"
# to edit: sudo systemctl edit mentis-api  (opens /etc/systemd/system/mentis-api.service.d/override.conf)
# actual file in use: /etc/systemd/system/mentis-api.service.d/credentials.conf
```

Required `Environment=` keys (check names only — `grep -oE 'Environment=[A-Z_]+' credentials.conf`, never `cat` the raw file into a chat or log):

- `DASHSCOPE_API_KEY`, `DASHSCOPE_MODEL`, `DASHSCOPE_TIMEOUT_MS` — chat LLM.
- `MENTIS_DEMO_USERNAME`, `MENTIS_DEMO_PASSWORD` — the seeded "user" demo login.
- `MENTIS_CLINICIAN_DEMO_USERNAME`, `MENTIS_CLINICIAN_DEMO_PASSWORD` — seeded clinician login. **Required in production** — the server refuses to start without it (no fallback to the dev-only `clinician_demo`/`mentis_clinician` default).
- `MENTIS_ADMIN_DEMO_USERNAME`, `MENTIS_ADMIN_DEMO_PASSWORD` — same, for the admin login.
- `MENTIS_DATA_FILE` — set to `/opt/mentis-rehab-platform/data/platform-state.json`. Must stay outside `releases/*` or every deploy orphans the previous data.

After `systemctl edit`/editing the drop-in file, run `sudo systemctl daemon-reload` before `restart`, or the new env vars won't take effect.

## Sanity checklist before declaring a deploy done

1. `curl https://api.aimentis.site/health` → `{"ok":true,...}`.
2. An unauthenticated request to a protected route → `401`, not `200` (auth didn't regress).
3. `curl -s -o /dev/null -w '%{http_code}\n' https://aimentis.site/` → `200`, and the served JS bundle filename changed.
4. `ssh ... "sudo systemctl status mentis-api --no-pager"` shows `active (running)` with a **recent** start time (confirms it actually restarted, not that the old process silently kept running).
