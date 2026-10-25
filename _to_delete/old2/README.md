# Wheelie

School bus tracking with five account types, an orange Life360-style app, and
Mapbox-powered routing that accounts for bus clearance.

```
server/   Node + TypeScript + Express + Socket.io
mobile/   Expo (React Native) app, runs in Expo Go
```

## Accounts

| Account | How you get one | What it does |
|---|---|---|
| **Bus company** | Created by Wheelie (demo below) | Adds schools, builds routes from a list of stops, assigns drivers, sends routes to schools |
| **School** | Created by the bus company | Sees only its own routes, watches buses progress live, assigns students to stops |
| **Driver** | Sign up with the company's driver code | Starts/ends a ride (this is when location sharing turns on/off), scans students on |
| **Student** | Sign up with the school's student code | Shows a boarding QR, sees ETA, flags "not riding today" |
| **Parent** | Sign up with their child's code | Sees their child's status and the bus location while a ride is active |

Companies and schools can't self-register; students, parents and drivers can't pick a role they weren't invited to.

## Demo accounts (dev only)

Created on every server start. Password for all: `Wheelie!Demo1`

| Role | Email | Code / notes |
|---|---|---|
| Company | company@wheelie.demo | driver code `DRV-DEMO` |
| School | school@wheelie.demo | student code `SCH-DEMO` |
| Driver | driver@wheelie.demo | Morning Run - Ironbound |
| Driver 2 | driver2@wheelie.demo | North Ward (morning) + South Ward (afternoon) |
| Student | student@wheelie.demo | child code `KID-DEMO` (Ironbound run) |
| Student 2 | student2@wheelie.demo | child code `KID-AVA2` (North Ward run) |
| Parent | parent@wheelie.demo | linked to Sam Student |

Twelve more students (maya@, leo@, noah@, sofia@, elijah@, isabella@, mateo@, amara@, lucas@, zoe@, ethan@, layla@) fill out the three demo routes. Their parent codes are shown in their Account tab.

The demo routes are hand-built with straight-line paths and approximate Newark coordinates, so they show "clearance wasn't checked". Routes you build in the app go through Mapbox.

Seeding is off in production, or with `SEED_DEMO=false`. Data is saved in a SQLite database (`server/data/wheelie.db`), so it survives restarts. To start fresh, stop the server and delete the `server/data/` folder.

## Running it

```
cd server
cp .env.example .env     # then add your MAPBOX_TOKEN
npm install              # run this again after updating: the server now needs better-sqlite3
npm run dev              # :4000
npm test

cd ../mobile
npm install
npm start                # scan the QR in Expo Go
```

The app finds the server automatically from the Expo dev server's address. If you use `--tunnel`, set `EXPO_PUBLIC_API_URL` (or edit `MANUAL_API_URL` in `mobile/src/api/client.ts`).

### Mapbox

Create a free account at mapbox.com and copy a **public** token (`pk.…`) into `server/.env` as `MAPBOX_TOKEN`. It powers:

- address search (Geocoding)
- ordering stops (Optimization API)
- road path, times and **bus clearance** (Directions API with `max_height`, `max_width`, `max_weight`)
- the map itself (Mapbox GL JS in a WebView, so it works in Expo Go)

Without a token everything except maps and route building still works, and the demo route is hand-built so you can test the rest.

How a route gets built: the stop farthest from the school becomes the far end of the run, Mapbox Optimization orders the stops in between, then Directions draws the road path for the whole run using your bus's size. The Optimization API has no vehicle-size options, so *ordering* ignores clearance while the *road path* respects it. Mapbox's clearance coverage varies by region; treat it as a safety net, not a guarantee.

The map token is delivered to signed-in users so the map can draw. In the Mapbox dashboard, keep it to public scopes and add URL restrictions once you have a real domain.

## Database

Everything is stored in one SQLite file (`DB_PATH`, default `server/data/wheelie.db`) using `better-sqlite3`. There is nothing to install or run: the file is created on first start and updated automatically by numbered migrations when you pull a new version.

- Accounts, routes and live rides are kept in memory for speed and written to the file after every change (and when the server shuts down cleanly).
- Alerts, history, absences, the audit log, push tokens and sign-in sessions have their own tables.
- Back it up while the server is running: `npm run backup` (writes a consistent copy into `server/backups/`).
- Moving to Postgres later is possible, but one SQLite file on a persistent disk comfortably handles a few hundred buses. See `docs/DEPLOY.md`.

## What's in the app

**Everyone**: sign-in with silent token refresh, forgot password (6-digit code by email), email confirmation, Alerts inbox with unread badge, push notifications, English / Spanish / Portuguese, download my data, delete my account, sign-up consent.

**Students and parents**: live bus, ETA and status; delay / breakdown banners; "arrived at school / dropped off" status; plan "not riding" days up to 60 days ahead; ride history (90 days); parents can link several children and set "hand to an adult" rules with a list of allowed pickup names.

**Drivers**: location keeps sharing when the phone is locked (development build only, see `docs/DEV_BUILD.md`); report delay / breakdown / accident and clear it with "Back on the road"; drop-off with adult hand-off; end-of-ride check that students aren't still aboard; warnings when scanning a student on the wrong bus or stop; scans made without signal are saved and sent later (counted once).

**Schools and bus companies**: Reports (rides, boarded %, missed, incidents, on-time, CSV export), activity log, student list import from CSV with optional parent email invites, usual start times, handing a running route to a substitute driver, automatic alerts when a bus leaves its route or sits still.

**Debug menu (development only)**: in a development run (`npm start`) a small bug tab on the left edge of every screen opens a list of all screens, plus one-tap sign-in as any demo account. It's compiled out of production builds and doesn't change how the app's own tabs and screens work.

### Environment variables

See `server/.env.example` for the full list with comments. The ones you'll most likely set: `MAPBOX_TOKEN`, `JWT_SECRET` (required in production), `DB_PATH`, `RESEND_API_KEY` + `EMAIL_FROM` (without these, emails are printed in the server console), `SCHOOL_TIMEZONE`, `PRIVACY_URL`, `TERMS_URL`.

### Docs

- `docs/DEPLOY.md`: putting the server online (Fly.io, Render, Railway), HTTPS, backups
- `docs/DEV_BUILD.md`: the development build needed for background GPS and push on Android
- `docs/PRIVACY_AND_COMPLIANCE.md`: what data is collected, retention, FERPA / COPPA notes

## Tap-in

Phones can't read RFID. The student's phone shows a QR code containing a signed token that expires in under a minute and refreshes itself; the driver's phone scans it, which marks the student on board. A screenshot stops working almost immediately. The server already accepts static NFC card IDs (`tagId`) for physical cards; reading them needs a custom dev build with NFC (and a paid Apple developer account for iPhones), so it isn't in the Expo Go build.

## Security

- Passwords: bcrypt (cost 12), 8+ chars with a letter and a number, never returned to clients
- Sessions: 30-minute access tokens plus rotating 30-day refresh tokens (a reused old token revokes the whole chain), stored in the phone's secure keychain; changing or resetting a password signs out other devices
- Background GPS uses a separate token that can only update one ride's location
- Login: rate-limited, account locks for 15 min after 5 bad attempts, same error for unknown email and wrong password
- Every endpoint and socket requires sign-in and checks who you are; roles are enforced server-side
- Families only receive their own child's data (never other riders on the bus)
- Students no longer share their location at all; boarding is by tap-in only
- Bus location is shared only between ride start and ride end, and only the ride's own driver can post it
- Invite codes are random and guess-limited; a student can replace their parent code
- Input validated with zod; helmet headers; no stack traces returned
- Spreadsheet exports are protected against formula injection; sensitive actions are written to an audit log
- Production refuses plain HTTP when `REQUIRE_HTTPS=true`

## Known gaps

- Background GPS and Android push need a development build; Expo Go only does foreground GPS and iPhone push (`docs/DEV_BUILD.md`)
- Push notifications could not be tested end to end without a real phone and an Expo project id
- Company and school screens are English only (families and drivers have Spanish and Portuguese)
- Emails need a Resend account (or another provider wired into `server/src/services/email.ts`)
- Physical NFC cards / hardware readers: the server accepts a `tagId`, but no reader is wired up
- SQLite is a single file on one server; for several servers at once you'd move to Postgres
- Review `docs/PRIVACY_AND_COMPLIANCE.md` with a lawyer before collecting real student data
