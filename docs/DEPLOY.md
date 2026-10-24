# Putting the Wheelie server online

You need the server on the internet with HTTPS so phones can reach it anywhere (not just your Wi-Fi). The app talks to the address in `EXPO_PUBLIC_API_URL`.

Pick any host that runs a Docker image or Node 20+ **and gives you a persistent disk** (the SQLite database is a file). Below is Fly.io, which the repo is already set up for; Render and Railway are the same idea.

## Before you start

1. Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
2. Get a Mapbox public token (mapbox.com) and, for email, a Resend API key (resend.com, free tier) with a verified sender domain.
3. Decide your `PRIVACY_URL` and `TERMS_URL` (see `PRIVACY_AND_COMPLIANCE.md`).

## Fly.io

```
brew install flyctl            # or see fly.io/docs/flyctl/install
fly auth signup                # or: fly auth login
cd server
fly launch --no-deploy --copy-config     # keeps the included fly.toml; pick your own app name
fly volumes create wheelie_data --size 1 --region ewr
fly secrets set \
  JWT_SECRET=<your secret> \
  MAPBOX_TOKEN=pk.xxxxx \
  RESEND_API_KEY=re_xxxxx \
  EMAIL_FROM="Wheelie <no-reply@yourdomain.com>" \
  PRIVACY_URL=https://yourdomain.com/privacy \
  TERMS_URL=https://yourdomain.com/terms \
  SEED_DEMO=false
fly deploy
```

Your server is now at `https://<app-name>.fly.dev`. Check `https://<app-name>.fly.dev/health` shows `{"ok":true}`.

Important settings already in `fly.toml`: one machine always on (buses report all day), the data volume mounted at `/data`, `TRUST_PROXY=1` and `REQUIRE_HTTPS=true` (Fly terminates TLS and the server refuses plain HTTP). **Keep it at one machine**: SQLite is a single file, and live rides are held in memory.

## Render / Railway

- Create a Web Service from the `server/` folder using the Dockerfile.
- Add a persistent disk mounted at `/data`.
- Set the same environment variables as above, plus `DB_PATH=/data/wheelie.db`, `TRUST_PROXY=1`, `REQUIRE_HTTPS=true`, `PORT` to what the host expects.
- Render's free tier sleeps and has no disk; use a paid instance.

## Pointing the app at it

In `mobile/`, before building or running:

```
EXPO_PUBLIC_API_URL=https://<app-name>.fly.dev npx expo start
```

For store builds put the same value in the EAS build environment (`eas env:create` / `eas.json` `env`).

## Backups

The database is the only thing worth backing up.

- Take a copy any time: `fly ssh console -C "sh -c 'BACKUP_DIR=/data/backups node scripts/backup.mjs'"` writes a consistent copy to `/data/backups/` on the volume, even while the server is running.
- Download it: `fly ssh sftp get /data/backups/<file>` .
- Also turn on Fly volume snapshots (daily by default; `fly volumes snapshots list`).
- Practice a restore once: stop the app, put the file back at `/data/wheelie.db`, start.

## After deploy: checklist

- Sign up a test parent with a real email and confirm the verification code arrives.
- Try "Forgot password".
- Start a ride with a test driver on a real phone and watch it from another.
- Check `fly logs` for errors. Emails printed in the logs mean `RESEND_API_KEY` isn't set.
- Set a calendar reminder to rotate `JWT_SECRET` only if you must: changing it signs everyone out.
