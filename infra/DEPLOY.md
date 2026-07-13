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

## 一次性迁移：清理健身动作库（2026-07）

动作库从 1112 条导入的健身动作换成了手写的膝关节康复库（见
`apps/api/src/action-library.seed.ts`）。但 `storage.ts` 的 `hydrateFromDisk`
对 `actionLibrary` 用的是「种子 ∪ 磁盘上种子没有的条目」这种增量合并策略——
只删代码里的 1112 条不够，它们还躺在生产的 `platform-state.json` 里，下次
重启会被原样并回内存。必须单独跑一次 `scripts/purge-fitness-library.mjs`
清理数据文件，这是一次性操作，不需要每次部署都跑。

删除判据是 `tags` 数组包含 `"exercise-library"`（当年生成脚本给每条导入动作
打的第一个 tag）。模型在真实问诊里生成并存下来的动作（`source: "ai"`）、
以及没有这个 tag 的条目都会保留，不受影响。已有用户的训练计划也不受影响：
计划里每个 item 自带 `title` / `instructions` 快照，不是对动作库的引用。

**先在本地/副本上验证过（dry-run 数字、`--apply` 后计划条数不变、备份文件
完整）才动生产数据。** 跑的具体时机——是否再手动备份一份到 iCloud、要不要
挑夜间窗口——由人确认，不要自己拍板。

在服务器上（`releases/*` 里已经有最新代码之后再做，不需要额外部署一次）：

1. 停服务：
   ```bash
   ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40 "sudo systemctl stop mentis-api"
   ```
2. dry-run，看看会删多少（不改任何文件）：
   ```bash
   ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40 "
     node /opt/mentis-rehab-platform/current/scripts/purge-fitness-library.mjs \
       /opt/mentis-rehab-platform/data/platform-state.json
   "
   ```
3. 核对打印出来的数字：删除数应该在 1112 附近，`source=ai` 的条目数应该 > 0
   （如果生产已经跑了一段时间、模型生成过动作的话）且这批不在删除范围内。
   数字不对就停下来，不要往下走。
4. 确认无误后加 `--apply`（脚本会自动先把原文件备份成
   `platform-state.json.bak-<ISO时间戳>`，再写回瘦身后的数据）：
   ```bash
   ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40 "
     node /opt/mentis-rehab-platform/current/scripts/purge-fitness-library.mjs \
       /opt/mentis-rehab-platform/data/platform-state.json --apply
   "
   ```
5. 起服务：
   ```bash
   ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40 "sudo systemctl restart mentis-api"
   ```
6. 自检：
   ```bash
   curl -s https://api.aimentis.site/health   # 期望 {"ok":true,...}
   ```
   再登录一个账号，`GET /v1/action-library` 应该只剩康复动作，没有
   `exercise_` 开头的 id 了。

**回滚**：出问题就把备份文件盖回原文件名，再重启服务，不需要重新部署代码。
```bash
ssh -i /Users/rez/Documents/claw.pem ubuntu@43.167.196.40 "
  sudo -u mentis cp /opt/mentis-rehab-platform/data/platform-state.json.bak-<时间戳> \
    /opt/mentis-rehab-platform/data/platform-state.json
  sudo systemctl restart mentis-api
"
```
