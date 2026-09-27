# Bus App — rudimentary build

A cross-platform school bus tracking app: student/parent/driver/admin roles,
live ride activation, automatic boarding/missed detection via geofencing,
scoped chat, and a live reroute when a rider flags they're not coming.

This is a **working scaffold**, not a finished product. The core logic
(routing, geofencing, reroute) is real and unit-tested. The API/auth/maps
layer is intentionally left thin — see "What's stubbed" below.

## Structure

```
bus-app/
  server/     Node + TypeScript + Express + Socket.io backend
  mobile/     Expo (React Native + TypeScript) app for all four roles
```

## What's actually implemented

- **Roles**: student, parent, admin, driver, each with their own home
  screen and only the actions scoped to them (parents can't activate a
  ride; students/drivers can).
- **Ride activation**: toggles real GPS sharing (`expo-location`) for the
  duration of a ride.
- **Geofencing**: haversine-distance-based geofence check
  (`server/src/services/geofence.ts`) drives boarding detection (bus +
  student both inside a stop's radius) and missed-bus detection (bus
  departs the stop while a student never showed).
- **Reroute on skip** — the feature you called out: when a student (or
  their parent) taps "not riding today," `markStudentNotRiding()` in
  `server/src/services/routing.ts` checks whether anyone else is still
  waiting at that stop. If not, the stop is pulled out of the *live* route
  immediately and every downstream stop's ETA is recomputed — see
  `server/tests/routing.test.ts` for a test that proves the downstream ETA
  actually gets earlier. If someone else is still riding, only that
  student's own status is marked skipped and the bus still stops.
- **Chat**: scoped conversations (parent group, parent↔driver,
  driver/parent↔admin) over Socket.io. Student-to-student chat was cut, per
  our discussion.
- **Admin**: route/roster listing. A fuller admin dashboard (notifications,
  live map of every bus) is left for later and is a better fit as a web
  view than a phone screen.
- **Cut/deferred, per your calls**: driver behavior monitoring (speed,
  harsh braking) — needs telematics hardware, not just a phone. Real-time
  mid-route dynamic re-routing beyond "skip an empty stop" (full VRP
  re-optimization) — the stop-skip reroute above is the version we agreed
  matters now.

## What's stubbed on purpose (the "API stuff")

- **Auth**: `POST /auth/login` just creates-or-fetches a user by
  phone/email with no real OTP/verification. No SMS/email provider is
  wired up.
- **Maps/ETA**: ETA is straight-line distance ÷ an assumed average speed
  (`server/src/services/eta.ts`), not a real routing/traffic API. Good
  enough to see ETAs move correctly when a stop is skipped; swap in
  Google/Mapbox routing later for real road-network ETAs.
- **Push notifications**: not implemented — admin "contact drivers/parents"
  is chat-only for now.
- **Auto-route planning** (turning a list of addresses into an optimized
  route): not built. Routes are created directly via `POST /routes` with
  stops you supply in order. This is a genuinely hard problem (a variant
  of the vehicle routing problem) — worth reaching for an existing
  optimization API/library rather than hand-rolling a solver.

## Running it

### Server

```
cd server
npm install
npm run dev        # starts on :4000
npm test           # runs the routing/geofence tests
```

### Mobile

```
cd mobile
npm install
npm start          # opens Expo dev tools; scan the QR with Expo Go
```

Before testing on a real phone, change `API_BASE_URL` in
`mobile/src/api/client.ts` from `localhost` to your computer's LAN IP —
a phone can't resolve `localhost` as your dev machine.

### Trying the reroute feature end-to-end

1. Start the server.
2. `POST /routes` with a route that has 2–3 stops, each with one or more
   `studentIds`.
3. `POST /rides/start` with that route's id and a driver id.
4. `POST /rides/:id/location` a few times to move the simulated bus and
   watch ETAs in the response.
5. `POST /rides/:id/not-riding` with a student id from a stop where
   they're the only rider — the response's `remainingStopIds` will have
   dropped that stop, and downstream ETAs will drop too.

## Suggested next steps

1. Wire a real routing/maps API for ETA instead of straight-line distance.
2. Add background location tracking (`expo-task-manager`) so sharing
   survives the phone being locked.
3. Move from in-memory storage (`server/src/data/store.ts`) to Postgres.
4. Build the auto-route planner as a separate service that calls an
   existing VRP solver/API and writes the result via `PUT /routes/:id`.
5. Real auth (phone/email OTP for students/parents; admin-provisioned
   accounts for admin/driver, as planned).
# BusProject
