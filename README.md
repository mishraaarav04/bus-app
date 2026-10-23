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

Seeding is off in production, or with `SEED_DEMO=false`. Data lives in memory, so restarting the server clears sign-ups.

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

## Tap-in

Phones can't read RFID. The student's phone shows a QR code containing a signed token that expires in under a minute and refreshes itself; the driver's phone scans it, which marks the student on board. A screenshot stops working almost immediately. The server already accepts static NFC card IDs (`tagId`) for physical cards; reading them needs a custom dev build with NFC (and a paid Apple developer account for iPhones), so it isn't in the Expo Go build.

## Security

- Passwords: bcrypt (cost 12), 8+ chars with a letter and a number, never returned to clients
- Sessions: signed JWTs (12h), stored in the phone's secure keychain
- Login: rate-limited, account locks for 15 min after 5 bad attempts, same error for unknown email and wrong password
- Every endpoint and socket requires sign-in and checks who you are; roles are enforced server-side
- Families only receive their own child's data (never other riders on the bus)
- Students no longer share their location at all; boarding is by tap-in only
- Bus location is shared only between ride start and ride end, and only the ride's own driver can post it
- Invite codes are random and guess-limited; a student can replace their parent code
- Input validated with zod; helmet headers; no stack traces returned

## Known gaps

- In-memory storage (swap for Postgres)
- Driver GPS is foreground only: it stops if the phone locks (needs a dev build + background location)
- No push notifications, no password reset by email (no email provider wired up yet)
- Chat API is secured but there's no chat screen in the app yet
- No HTTPS in dev; put the server behind TLS before real use
