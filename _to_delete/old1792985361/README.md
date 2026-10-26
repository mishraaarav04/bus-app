# RouteIQ

School bus tracking for bus companies, schools, drivers, students and parents.
Buses are tracked live on a map, routes follow real roads and respect the bus's
size, families get alerts, and an AI assistant helps staff understand and
communicate what is happening.

```
server/   Node + TypeScript + Express + Socket.IO + SQLite
mobile/   Expo (React Native) app for drivers, students, parents, schools and companies
web/      Public homepage + staff dashboard for company and school accounts (Vite + React)
docs/     Deploying, development builds, privacy and compliance notes
```

## Contents

- [How it works](#how-it-works)
- [Accounts](#accounts)
- [Features](#features)
- [Products used](#products-used)
- [Running it](#running-it)
- [Putting it online](#putting-it-online)
- [AI features](#ai-features)
- [Demo data](#demo-data)
- [Database](#database)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Tap-in](#tap-in)
- [Security](#security)
- [Known gaps](#known-gaps)

## How it works

1. A **bus company** adds schools and builds routes from a list of stops. Mapbox orders the stops and draws a road path that respects the bus's height, width and weight.
2. The company assigns a **driver** and sends the route to the **school**, which assigns students to stops.
3. The driver starts a ride from their phone. Location sharing turns on, and the bus appears live on the map for staff, students and parents.
4. At each stop the driver scans the student's QR code, or checks them in by hand if they have no phone. Parents get a boarding alert.
5. The server watches the ride. It learns how long each stop takes, warns families early if the bus will run late, and alerts the school if the bus leaves its route or sits still.
6. Staff review rides, incidents and trends on the website, and can ask questions about their data in plain English.

## Accounts

| Account | How you get one | What it does |
|---|---|---|
| **Bus company** | Created by RouteIQ (demo below) | Adds schools, builds routes from a list of stops, assigns drivers, sends routes to schools |
| **School** | Created by the bus company | Sees only its own routes, watches buses live, assigns students to stops |
| **Driver** | Sign up with the company's driver code | Starts and ends a ride (this is when location sharing turns on and off), scans or checks students in |
| **Student** | Sign up with the school's join (student) code | Shows a boarding QR, sees the bus and ETA, flags "not riding today" |
| **Parent** | Sign up with their child's code | Sees their child's status and the bus location while a ride is active |

Companies and schools can't self-register; students, parents and drivers can't pick a role they weren't invited to.

## Features

**Everyone**: sign-in with silent token refresh, forgot password (6-digit code by email), email confirmation, Alerts inbox with unread badge, push notifications, English / Spanish / Portuguese, download my data, delete my account, sign-up consent.

**Live tracking**: drivers share the bus's GPS location while a ride runs. Students and parents watch it move on a map with the route and an arrival time, and are notified as the bus nears their stop.

**Students and parents**: live bus, ETA and status; delay / breakdown banners; "arrived at school / dropped off" status; plan "not riding" days up to 60 days ahead; parents get an alert when a child marks themselves as not riding or when another parent plans an absence; ride history (90 days); parents can link several children and set "hand to an adult" rules with a list of allowed pickup names.

**Drivers**: scan each student's QR code at the stop, or check in any student by hand (for students without a phone; the parent gets the normal boarding alert and the activity log records it); location keeps sharing when the phone is locked (development build only, see `docs/DEV_BUILD.md`); report delay / breakdown / accident and clear it with "Back on the road"; drop-off with adult hand-off; end-of-ride check that students aren't still aboard; warnings when scanning a student on the wrong bus or stop; scans made without signal are saved and sent later (counted once).

**Schools and bus companies** (app and website): see every route and the students on it, Reports (rides, boarded %, missed, incidents, on-time, CSV export), activity log, student list import from CSV with optional parent email invites, usual start times, handing a running route to a substitute driver, and automatic alerts when a bus leaves its route or sits still.

**Website (`web/`)**: a public homepage with an FAQ, then a staff-only dashboard:

| Page | What it does |
|---|---|
| Live overview | Map and list of running buses, today's rides and alerts |
| Routes | Build, edit, assign a driver, schedule and send routes |
| Team | Driver code, bus measurements, drivers and schools |
| Students | Assign students to stops, roster import |
| Insights | Expected riders, things worth a look, route ideas, arrival-time accuracy |
| Ask RouteIQ | Ask questions about your routes in plain words |
| Reports | Rides and boardings, with CSV download |
| Alerts | Incident inbox, and the notice writer for announcements to families |
| Activity | Audit log of sensitive actions |
| Account | Your settings |

See `web/README.md` for details.

**Debug menu (development only)**: in a development run (`npm start`) a small bug tab on the left edge of every screen opens a list of all screens, plus one-tap sign-in as any demo account. It's compiled out of production builds.

## Products used

**Website**: React 18, React Router, Vite, TypeScript, Mapbox GL JS, Socket.IO Client, plain CSS.

**Mobile app**: React Native, Expo (Location, Task Manager, Notifications, Camera, Secure Store, Localization, Document Picker, Font, Constants), React Navigation, React Native WebView, React Native SVG, QR Code SVG, Socket.IO Client, TypeScript.

**Server**: Node.js, Express, Socket.IO, SQLite (better-sqlite3), Zod, jsonwebtoken, bcryptjs, Helmet, express-rate-limit, CORS, dotenv, UUID, TypeScript (run with tsx).

**Testing**: Vitest.

**Services**: Mapbox (maps, address search, routing), NVIDIA NIM (AI assistant and notice writer), Resend (email, optional), Expo push notification service.

**Hosting and tools**: Vercel (website), ngrok (public tunnel to the server), GitHub.

## Running it

```
cd server
cp .env.example .env     # then add your MAPBOX_TOKEN
npm install
npm run dev              # :4000
npm test

cd ../mobile
npm install
npm start                # scan the QR in Expo Go

cd ../web
npm install
cp .env.example .env
npm run dev              # :5173, sign in with company@ or school@wheelie.demo
```

On your home wifi the app finds the server automatically from the Expo dev server's address. Away from home, see [Putting it online](#putting-it-online).

### Mapbox

Create a free account at mapbox.com and copy a **public** token (`pk.…`) into `server/.env` as `MAPBOX_TOKEN`. It powers:

- address search (Geocoding)
- ordering stops (Optimization API)
- road path, times and **bus clearance** (Directions API with `max_height`, `max_width`, `max_weight`)
- the map itself (Mapbox GL JS in a WebView, so it works in Expo Go)

Without a token everything except maps and route building still works, and the demo route is hand-built so you can test the rest.

How a route gets built: the stop farthest from the school becomes the far end of the run, Mapbox Optimization orders the stops in between, then Directions draws the road path for the whole run using your bus's size. The Optimization API has no vehicle-size options, so *ordering* ignores clearance while the *road path* respects it. Mapbox's clearance coverage varies by region; treat it as a safety net, not a guarantee.

The map token is delivered to signed-in users so the map can draw. In the Mapbox dashboard, keep it to public scopes and add URL restrictions once you have a real domain.

## Putting it online

The server runs on your computer. To use the app away from home wifi, or to run the website from Vercel, the server needs a public https address.

**Free permanent address with ngrok**

1. Make a free account at ngrok.com and claim your free static domain (Domains page).
2. Install and sign in: `brew install ngrok`, then `ngrok config add-authtoken YOUR_TOKEN`.
3. In `server/.env` set `NGROK_DOMAIN=your-name.ngrok-free.dev` and `WEB_ORIGIN=https://your-site.vercel.app`.
4. Start the server and the tunnel together: `cd server && npm run tunnel`. This also sets `TRUST_PROXY=1`, which the server needs behind a proxy.
5. Check `https://your-name.ngrok-free.dev/health` says `ok`.

The computer must stay on and online. For an always-on server, host it instead (see `docs/DEPLOY.md`).

**Website on Vercel**

- Project Root Directory: `web`. Build command `npm run build`, output `dist`.
- Environment variable `VITE_API_URL=https://your-name.ngrok-free.dev` (with `https://`, no trailing slash). It is baked in at build time, so redeploy after changing it.
- `web/vercel.json` rewrites every path to `index.html` so reloading a page doesn't 404.

**Phone app**: set `EXPO_PUBLIC_API_URL=https://your-name.ngrok-free.dev` (or edit `MANUAL_API_URL` in `mobile/src/api/client.ts`) and run `npx expo start --tunnel -c`.

The website and app send an `ngrok-skip-browser-warning` header so ngrok's free-plan warning page doesn't block requests.

## AI features

Everything here also works in a simpler built-in mode with no AI key. Only totals, route names and driver names are ever sent to the AI service, never student names.

- **Arrival times that learn.** Every ride records how long the bus took between stops. After 3 rides on a route, estimates use those times (stops and traffic included) for rides starting at a similar time of day. Before that, they use distance and an average speed. The Insights page shows how much closer the learned estimates are.
- **Early late-bus warnings.** If a ride is on track to finish `DELAY_FORECAST_MINUTES` (default 6) later than the route usually does, families and staff get "Bus may be late", once, and again only if it gets 5+ minutes worse. Needs 4 past rides.
- **Insights (dashboard).** Expected riders per route (each student's own weekday pattern minus planned absences), things that look unusual (a ride that ran long, a route starting later, repeat problems, a regular rider who stopped showing up), and route ideas (merge nearby stops, overlapping routes, routes that could share a bus, nearly full buses). Ideas are suggestions; nothing changes by itself.
- **Ask RouteIQ (dashboard).** Ask questions about your routes in plain words. With `NVIDIA_API_KEY` set, an AI model on NVIDIA NIM answers using read-only lookups limited to your own account. Without a key, a built-in mode answers the common questions.
- **Notice writer (dashboard, Alerts).** Describe what happened in a few words, review the English, Spanish and Portuguese notice, then send it to a route's families. Nothing is sent without a person pressing Send, and each send is in the activity log.

**Setting up NVIDIA NIM**

1. Create a key at build.nvidia.com (it starts with `nvapi-`) and put it in `server/.env` as `NVIDIA_API_KEY`.
2. Restart the server. The first line it prints says `AI: on` when the key is found.
3. NVIDIA retires hosted models from time to time (a retired model answers 404 or 410). With `AI_MODEL` unset, the server tries a list of known models, then NVIDIA's model list, and logs the one that worked.
4. To choose one yourself, run `npm run ai-models` in `server/`. It tests each model your key can see and prints the ones that work, with whether they support tool calls, and the `AI_MODEL=` line to add to `.env`. Ask RouteIQ needs a model with tool calling.

Any OpenAI-compatible service also works: set `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL`. Failures are logged to the server terminal with an `[ai]` prefix.

## Demo data

Created on every server start (dev only). Password for all demo accounts: `Wheelie!Demo1`

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

### Point the demo at your own streets

`server/scripts/use-my-streets.ts` adds a morning route between addresses you choose, with a path that follows real roads (Mapbox Directions), and moves Sam and Ava onto it. Everyone else stays on their routes.

1. Edit `STOPS` and `SCHOOL` at the top of the file. The defaults are 61 Tingley Lane and 61 Teaberry Drive, going to Edison Academy Magnet School in Edison, NJ. Or pass `--school "name, street, town"`.
2. From `server/`, preview with `npx tsx scripts/use-my-streets.ts` (it changes nothing and prints what it found).
3. Stop the server, then run it again with `--apply`, and start the server again.

If the places it finds are far apart it stops and lists them. Pass `--near "lat,lng"` to prefer matches closest to a point. Running it again updates the same route instead of adding a second one.

## Database

Everything is stored in one SQLite file (`DB_PATH`, default `server/data/wheelie.db`) using `better-sqlite3`. There is nothing to install or run: the file is created on first start and updated automatically by numbered migrations when you pull a new version.

- Accounts, routes and live rides are kept in memory for speed and written to the file after every change (and when the server shuts down cleanly).
- Alerts, history, absences, the audit log, push tokens, sign-in sessions and learned stop times have their own tables.
- Back it up while the server is running: `npm run backup` (writes a consistent copy into `server/backups/`).
- Moving to Postgres later is possible, but one SQLite file on a persistent disk comfortably handles a few hundred buses. See `docs/DEPLOY.md`.

## Environment variables

See `server/.env.example` for the full list with comments. The ones you'll most likely set:

| Variable | Purpose |
|---|---|
| `MAPBOX_TOKEN` | Maps, address search, routing |
| `JWT_SECRET` | Signing sign-in tokens (required in production) |
| `DB_PATH` | Where the SQLite file lives |
| `WEB_ORIGIN` | The website's address, so the browser may call the API (`http://localhost:5173` is allowed by default in development) |
| `NGROK_DOMAIN` | Your free static ngrok domain, used by `npm run tunnel` |
| `TRUST_PROXY` | Set to `1` behind a proxy or tunnel (`npm run tunnel` does this) |
| `NVIDIA_API_KEY` | Turns on the AI assistant and notice writer |
| `AI_MODEL`, `AI_BASE_URL`, `AI_API_KEY` | Optional AI overrides |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email (without these, emails are printed in the server console) |
| `DELAY_FORECAST_MINUTES`, `BUS_SEATS` | Late-bus warning threshold, seats per bus |
| `APPROACH_SECONDS`, `OFF_ROUTE_METERS`, `STATIONARY_SECONDS` | When "bus is close", off-route and stopped alerts fire |
| `SCHOOL_TIMEZONE`, `PRIVACY_URL`, `TERMS_URL` | Local time and legal links |

## Scripts

Run these from `server/`.

| Command | What it does |
|---|---|
| `npm run dev` | Start the server with auto-reload |
| `npm test` | Run the test suite |
| `npm run tunnel` | Start the server and the ngrok tunnel together |
| `npm run ai-models` | Test which NVIDIA models your key can use |
| `npm run use-my-streets` | Move the demo onto your own streets (see above) |
| `npm run backup` | Copy the database safely while the server runs |
| `npm run typecheck` | Check types |

### Docs

- `docs/DEPLOY.md`: putting the server online (Fly.io, Render, Railway), HTTPS, backups
- `docs/DEV_BUILD.md`: the development build needed for background GPS and push on Android
- `docs/PRIVACY_AND_COMPLIANCE.md`: what data is collected, retention, FERPA / COPPA notes

## Tap-in

Phones can't read RFID. The student's phone shows a QR code containing a signed token that expires in under a minute and refreshes itself; the driver's phone scans it, which marks the student on board. A screenshot stops working almost immediately. Students without a phone are checked in by hand. The server already accepts static NFC card IDs (`tagId`) for physical cards; reading them needs a custom dev build with NFC (and a paid Apple developer account for iPhones), so it isn't in the Expo Go build.

## Security

- Passwords: bcrypt (cost 12), 8+ chars with a letter and a number, never returned to clients
- Sessions: 30-minute access tokens plus rotating 30-day refresh tokens (a reused old token revokes the whole chain), stored in the phone's secure keychain; changing or resetting a password signs out other devices
- Background GPS uses a separate token that can only update one ride's location
- Login: rate-limited, account locks for 15 min after 5 bad attempts, same error for unknown email and wrong password
- Every endpoint and socket requires sign-in and checks who you are; roles are enforced server-side
- Families only receive their own child's data (never other riders on the bus)
- Students don't share their location at all; boarding is by tap-in only
- Bus location is shared only between ride start and ride end, and only the ride's own driver can post it
- Invite codes are random and guess-limited; a student can replace their parent code
- Input validated with zod; helmet headers; no stack traces returned
- Spreadsheet exports are protected against formula injection; sensitive actions are written to an audit log
- AI lookups are read-only, limited to the signed-in account, and never include student names
- Production refuses plain HTTP when `REQUIRE_HTTPS=true`

## Known gaps

- Background GPS and Android push need a development build; Expo Go only does foreground GPS and iPhone push (`docs/DEV_BUILD.md`)
- Push notifications could not be tested end to end without a real phone and an Expo project id
- Company and school screens are English only (families and drivers have Spanish and Portuguese)
- Emails need a Resend account (or another provider wired into `server/src/services/email.ts`)
- Physical NFC cards / hardware readers: the server accepts a `tagId`, but no reader is wired up
- SQLite is a single file on one server; for several servers at once you'd move to Postgres
- The ngrok tunnel only works while your computer is on; host the server for always-on use
- The AI assistant depends on which NVIDIA models are currently available to your key
- Review `docs/PRIVACY_AND_COMPLIANCE.md` with a lawyer before collecting real student data
