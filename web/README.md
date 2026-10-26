# RouteIQ website

The public homepage and the dashboard for school and bus company accounts.
Vite + React + TypeScript. Orange brand, Bricolage Grotesque + Figtree.

```
cd web
npm install
cp .env.example .env     # VITE_API_URL defaults to http://localhost:4000
npm run dev              # http://localhost:5173
npm run build            # type-checks, then writes dist/
```

Start the server too (`cd server && npm run dev`). Sign in with `company@wheelie.demo` or `school@wheelie.demo` (password `Wheelie!Demo1`).

## Pages

- `/` homepage (product overview)
- `/signin` staff sign-in. Parent, student and driver accounts are told to use the app.
- `/app` live overview: map and list of running buses
- `/app/routes`, `/app/routes/:id` build, assign driver, schedule, send, delete (company); view (school)
- `/app/team` driver code, bus measurements, add schools (company)
- `/app/students` assign students to stops, roster import (school)
- `/app/insights` expected riders, things worth a look, route ideas, arrival-time accuracy
- `/app/ask` ask questions about your routes
- `/app/reports`, `/app/alerts` (inbox, and write and send a notice to families), `/app/activity`, `/app/account`

## Notes

- Ask RouteIQ and the notice writer work without any setup in a basic mode. Set `NVIDIA_API_KEY` in `server/.env` to let an AI model on NVIDIA NIM answer open questions and write the Spanish and Portuguese versions.
- The server must allow the website's address. In development `http://localhost:5173` already works. For a deployed site set `WEB_ORIGIN` on the server (comma-separated list), and `VITE_API_URL` when building the site.
- The map needs `MAPBOX_TOKEN` on the server. Without it the map area shows a message and everything else works.
- The refresh token is kept in `localStorage` and the access token in memory. Sign-in is limited to company and school accounts.
- Replace the placeholder `hello@routeiq.example` in `src/pages/Landing.tsx` with your real contact address.
- The site is a single-page app: host `dist/` with a rewrite of all paths to `index.html` (`web/vercel.json` does this on Vercel).
- On Vercel: Root Directory `web`, and set `VITE_API_URL` to the server's full https address (for example your ngrok domain) before building. Redeploy after changing it.
