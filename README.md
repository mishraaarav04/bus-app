# RouteIQ

RouteIQ is a school bus tracking system for bus companies, schools, drivers, students and parents. Buses are tracked live on a map, routes follow real roads and respect the size of the bus, families get alerts, and an AI assistant helps staff understand and communicate what is happening.

The project has three parts:

```
server/   Node + TypeScript + Express + Socket.IO + SQLite
mobile/   Expo (React Native) app for drivers, students, parents, schools and companies
web/      Public homepage and staff dashboard for company and school accounts (Vite + React)
```

## How a ride works

A bus company adds schools and builds routes from a list of stops. Mapbox orders the stops and draws a road path that respects the bus's height, width and weight. The company assigns a driver and sends the route to the school, which assigns students to stops.

When the driver starts a ride from their phone, location sharing turns on and the bus appears live on the map for staff, students and parents. At each stop the driver scans the student's QR code, or checks the student in by hand if they have no phone, and the parent gets a boarding alert.

While the ride runs, the server learns how long each stop takes, warns families early if the bus is going to be late, and alerts the school if the bus leaves its route or sits still. Afterwards, staff review rides, incidents and trends on the website and can ask questions about their data in plain English.

## Accounts

| Account | How it is created | What it does |
|---|---|---|
| Bus company | Created by RouteIQ | Adds schools, builds routes, assigns drivers, sends routes to schools |
| School | Created by the bus company | Sees its own routes and the students on them, watches buses live, assigns students to stops |
| Driver | Signs up with the company's driver code | Starts and ends rides, scans or checks in students |
| Student | Signs up with the school's join code | Shows a boarding QR, sees the bus and its arrival time, marks "not riding today" |
| Parent | Signs up with their child's code | Sees their child's status and the bus location while a ride is active |

Companies and schools cannot self-register, and students, parents and drivers cannot pick a role they were not invited to.

## What it does

**Live tracking.** Drivers share the bus's GPS location while a ride runs. Students and parents watch it move on a map along the route, with an arrival time, and are notified as the bus nears their stop. Location is only shared between ride start and ride end, and only the ride's own driver can post it. Students never share their location.

**Check-in.** The student's phone shows a QR code containing a signed token that expires in under a minute and refreshes itself, so a screenshot stops working almost immediately. The driver scans it at the stop. Students without a phone are checked in by hand, which sends the same boarding alert and is recorded in the activity log.

**Students and parents.** Live bus, arrival time and status, delay and breakdown banners, and an "arrived at school" status. Students and parents can plan "not riding" days up to 60 days ahead, and parents are alerted when a child or another parent does. Parents can link several children, set "hand to an adult" rules with a list of allowed pickup names, and see 90 days of ride history.

**Drivers.** Scanning and manual check-in, location that keeps sharing when the phone is locked (development build only), reporting a delay, breakdown or accident and clearing it with "Back on the road", drop-off with adult hand-off, an end-of-ride check that no student is still aboard, warnings when a student is scanned on the wrong bus or stop, and scans made without signal that are saved and sent later.

**Schools and bus companies.** Every route to the school and the students on it, reports (rides, boarded percentage, missed students, incidents, on-time rate, CSV export), an activity log, student roster import from CSV with optional parent email invites, usual start times, handing a running route to a substitute driver, and automatic alerts when a bus leaves its route or sits still.

**Everyone.** Sign-in with silent token refresh, forgotten-password codes by email, email confirmation, an alerts inbox with an unread badge, push notifications, English, Spanish and Portuguese for families and drivers, downloading personal data, and deleting an account.

## The website

The public homepage shows the features and an FAQ. Behind the staff sign-in is a dashboard for company and school accounts:

| Page | What it does |
|---|---|
| Live overview | Map and list of running buses, today's rides and alerts |
| Routes | Build, edit, assign a driver, schedule and send routes |
| Team | Driver code, bus measurements, drivers and schools |
| Students | Assign students to stops, roster import |
| Insights | Expected riders, things worth a look, route ideas, arrival-time accuracy |
| Ask RouteIQ | Questions about routes in plain words |
| Reports | Rides and boardings, with CSV download |
| Alerts | Incident inbox, and the notice writer for announcements to families |
| Activity | Audit log of sensitive actions |
| Account | Settings |

## Routing with Mapbox

Mapbox provides the maps, address search and routing. When a route is built, the stop farthest from the school becomes the far end of the run, the Optimization API orders the stops in between, and the Directions API draws the road path for the whole run using the bus's height, width and weight. The Optimization API has no vehicle-size options, so the order of stops ignores clearance while the road path respects it. Clearance coverage varies by region, so it is treated as a safety net, not a guarantee. The map itself is Mapbox GL JS, shown in a WebView in the app so it works in Expo Go.

## AI features

All of these also work in a simpler built-in mode when no AI key is set. Only totals, route names and driver names are ever sent to the AI service, never student names.

- **Arrival times that learn.** Every ride records how long the bus took between stops. After three rides on a route, estimates use those times for rides starting at a similar time of day, instead of distance and an average speed. The Insights page shows how much closer they are.
- **Early late-bus warnings.** If a ride is on track to finish several minutes later than the route usually does, families and staff get a "Bus may be late" notice once, and again only if it gets noticeably worse.
- **Insights.** Expected riders per route from each student's weekday pattern and planned absences, things that look unusual (a ride that ran long, a route starting later, repeated problems, a regular rider who stopped showing up), and route ideas such as merging nearby stops or sharing a bus. These are suggestions; nothing changes by itself.
- **Ask RouteIQ.** Staff ask questions in plain words, and an AI model answers using read-only lookups limited to their own account.
- **Notice writer.** Staff describe what happened in a few words and get an English, Spanish and Portuguese notice to review. Nothing is sent without a person pressing Send, and each send is recorded in the activity log.

The AI runs on NVIDIA NIM. The server talks to it through an OpenAI-style chat API, so any compatible service could be swapped in. Because NVIDIA retires hosted models from time to time, the server tries a list of known models, then the account's live model list, and uses the first one that answers. A script tests which models a key can actually use and whether they support tool calls, which Ask RouteIQ needs.

## Products used

**Website:** React 18, React Router, Vite, TypeScript, Mapbox GL JS, Socket.IO Client, plain CSS.

**Mobile app:** React Native, Expo (Location, Task Manager, Notifications, Camera, Secure Store, Localization, Document Picker, Font, Constants), React Navigation, React Native WebView, React Native SVG, QR Code SVG, Socket.IO Client, TypeScript.

**Server:** Node.js, Express, Socket.IO, SQLite (better-sqlite3), Zod, jsonwebtoken, bcryptjs, Helmet, express-rate-limit, CORS, dotenv, UUID, TypeScript run with tsx.

**Testing:** Vitest.

**Services:** Mapbox (maps, address search, routing), NVIDIA NIM (AI assistant and notice writer), Resend (email, optional), Expo push notification service.

**Hosting and tools:** Vercel (website), ngrok (public tunnel to the server), GitHub.

## How it is deployed

The server runs on the developer's computer. The website is hosted on Vercel and the phone app runs in Expo Go, so both reach the server through an ngrok tunnel on a free static domain, which gives the server a permanent https address. The website is told the server's address when it is built, and the server is told which website address to allow. Because every request arrives through the tunnel, the server trusts one proxy hop so its rate limiter can tell visitors apart. The website and app send a header that skips ngrok's free-plan warning page, and the site rewrites every path to its single page so reloading a page does not fail.

This setup only works while the computer is on. For an always-on server, the server would be hosted instead (`docs/DEPLOY.md`).

## Demo data

In development the server creates demo accounts for every role: a company, a school, two drivers, two students with a linked parent, and twelve more students who fill out three demo routes. The demo routes are hand-built with straight-line paths and approximate Newark coordinates.

A script then moved two demo students, Sam and Ava, onto a new morning route between real addresses in Edison, NJ: 61 Tingley Lane, then 61 Teaberry Drive, ending at Edison Academy Magnet School. The route's path comes from Mapbox Directions, so the preview follows actual roads, and the other students stay on their original routes. Running it again updates the same route instead of adding a second one.

## Data and storage

Everything is stored in one SQLite file using better-sqlite3, created on first start and updated automatically by numbered migrations. Accounts, routes and live rides are kept in memory for speed and written to the file after every change and on a clean shutdown. Alerts, history, absences, the audit log, push tokens, sign-in sessions and learned stop times have their own tables. A backup script makes a consistent copy while the server runs. One file on a persistent disk comfortably handles a few hundred buses; moving to Postgres later is possible.

## Security

- Passwords use bcrypt, need 8 or more characters with a letter and a number, and are never returned to clients.
- Sessions use 30-minute access tokens and rotating 30-day refresh tokens, stored in the phone's secure keychain. Reusing an old refresh token revokes the whole chain, and changing a password signs out other devices.
- Background GPS uses a separate token that can only update one ride's location.
- Sign-in is rate-limited, accounts lock for 15 minutes after 5 bad attempts, and the error is the same for an unknown email and a wrong password.
- Every endpoint and socket requires sign-in, and roles are enforced on the server.
- Families only receive their own child's data, never other riders on the bus.
- Invite codes are random and guess-limited.
- Input is validated with Zod, Helmet sets security headers, and no stack traces are returned.
- Spreadsheet exports are protected against formula injection, and sensitive actions are written to an audit log.
- AI lookups are read-only, limited to the signed-in account, and never include student names.

## Documentation

- `docs/DEPLOY.md`: hosting the server online, HTTPS, backups
- `docs/DEV_BUILD.md`: the development build needed for background GPS and push on Android
- `docs/PRIVACY_AND_COMPLIANCE.md`: what data is collected, retention, FERPA and COPPA notes

## Known gaps

- Background GPS and Android push need a development build; Expo Go only does foreground GPS and iPhone push.
- Push notifications could not be tested end to end without a real phone and an Expo project id.
- Company and school screens are English only.
- Emails need a Resend account or another provider.
- Physical NFC cards are not wired up; the server accepts a card ID, but no reader exists.
- SQLite is a single file on one server.
- The ngrok tunnel only works while the computer is on.
- The AI assistant depends on which NVIDIA models are currently available to the key.
- The privacy and compliance notes should be reviewed with a lawyer before real student data is collected.
