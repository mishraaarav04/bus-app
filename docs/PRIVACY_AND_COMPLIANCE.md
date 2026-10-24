# Privacy and compliance notes

> This is a practical summary of what the app does with data, written by the developers. It is **not legal advice**. School transportation involves children's data, so have a lawyer or your school district's counsel review it before you use Wheelie with real students.

## What data Wheelie holds

| Data | Whose | Why | Where it lives |
|---|---|---|---|
| Name, email | Everyone | Sign-in, notices | `users` |
| Password | Everyone | Sign-in | Only as a bcrypt hash |
| Student's stop assignment, boarding / drop-off times | Students | Show the bus status, history, reports | Routes, `boarding_events`, `ride_history` |
| Planned "not riding" days | Students | Skip stops | `absences` |
| "Hand to an adult" flag and names of allowed adults | Students (set by parent) | Safe drop-off | `users` |
| Bus location | Driver's phone | Live map | Memory only during a ride; not stored afterwards |
| Push token, language, alert settings | Everyone | Notifications | `push_tokens`, `users` |
| Alerts sent | Everyone | Inbox | `notifications` (kept 90 days) |
| Staff actions (routes created, drivers changed...) | Company, school | Accountability | `audit_log` |
| Consent record | Everyone | Proof of agreement | `users` (terms version + time) |

What Wheelie does **not** collect: student locations (students never share GPS), photos, contact lists, advertising IDs. There is no advertising or analytics SDK in the app.

Third parties that receive data: Mapbox (addresses of stops, for route building and the map), Expo's push service (a push token plus the alert text), and your email provider (recipient address and message text).

## Retention

Controlled by `RETENTION_DAYS` (default 365): ride history, boarding records and incidents are deleted after that; the audit log is kept twice as long; alerts after 90 days; saved scans after 7 days; expired sign-in sessions and codes after a few days. A background job does this automatically every few hours. Choose the shortest period your district's rules allow.

## People's rights in the app

- **Download my data**: Account → Privacy → Download my data (JSON: profile and consent record, alerts, ride history and planned absences for the student or linked children).
- **Delete my account**: Account → Privacy → Delete my account (asks for the password). Removes the account, sign-in sessions, push tokens and alerts. Past ride records stay for the reports schools need, but the student's name is replaced with "Former student" and a driver's name is removed. Bus company and school accounts are removed by Wheelie on request.
- **Consent**: sign-up requires accepting the Terms and Privacy Policy (you provide the URLs in `PRIVACY_URL` / `TERMS_URL`). The version accepted is stored; bump `TERMS_VERSION` when you change them.
- **Parents** can unlink a child at any time, and control the child's pickup rules.

## US notes (FERPA, COPPA)

- **FERPA** applies when a school gives Wheelie student records. Typically the school can share them with a vendor acting as a "school official" under the school's direct control, using the data only for the agreed purpose. Put that in a written agreement with each school, and don't use the data for anything else (no ads, no selling).
- **COPPA** covers children under 13. In Wheelie, student accounts are created through the school's code or roster import; the school can consent on behalf of parents for educational purposes, but the school (or you) should document that. Keep the data you collect from children to what's needed (name, stop, boarding times). Do not add chat, photos or location sharing for students without revisiting this.
- Many states add their own student-privacy laws (e.g. New York Education Law 2-d, California SOPIPA). Ask your counsel which apply.

## Security measures to mention in agreements

Passwords hashed (bcrypt); short-lived access tokens with rotating refresh tokens; encrypted connections (HTTPS enforced in production); each person only receives data for their own role and children; location tokens limited to one ride; rate limiting and lockouts; audit log of staff actions; backups of the database (`DEPLOY.md`).

## Before real students use it

1. Write and publish a Privacy Policy and Terms (plain language, listing the table above) and set `PRIVACY_URL` / `TERMS_URL`.
2. Sign a data-sharing agreement with each school.
3. Turn on backups and choose `RETENTION_DAYS`.
4. Decide who at your company can reach the server and database; use a strong `JWT_SECRET`, and keep it secret.
5. Plan what you'll do if data is exposed (who you notify, how quickly). Many laws set deadlines.
6. Apple and Google ask you to describe background location and data collection in their store forms: match this document.
