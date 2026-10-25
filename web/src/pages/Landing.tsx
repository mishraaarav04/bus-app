import { Link } from "react-router-dom";
import { Logo } from "../components/ui";

function RouteMap() {
  // One bus drives a looping route; stops light up as it passes. Reduced-motion users get the still map.
  const d = "M40 330 C120 330 130 250 210 250 S300 330 360 270 S300 150 380 120 S470 90 520 60";
  return (
    <svg className="map" viewBox="0 0 560 520" role="img" aria-label="A bus route with four stops ending at school">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#fff" strokeOpacity=".14" strokeWidth="2" />
        </pattern>
      </defs>
      <rect width="560" height="520" fill="url(#grid)" />
      <g stroke="#fff" strokeOpacity=".22" strokeWidth="14" strokeLinecap="round" fill="none">
        <path d="M0 430 L260 400 L560 450" /><path d="M120 0 L170 520" /><path d="M430 0 L400 520" />
      </g>
      <path d={d} transform="translate(0 70)" fill="none" stroke="#231A14" strokeOpacity=".28" strokeWidth="16" strokeLinecap="round" />
      <path id="r" d={d} transform="translate(0 70)" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeDasharray="2 16" />
      {[[40, 400], [210, 320], [360, 340], [380, 190]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="17" fill="#fff" />
          <circle cx={x} cy={y} r="7" fill="#FF7A1A" />
        </g>
      ))}
      <g transform="translate(520 130)">
        <rect x="-26" y="-26" width="52" height="52" rx="14" fill="#231A14" />
        <path d="M-12 8V-4l12-9 12 9V8z" fill="#fff" />
        <rect x="-4" y="-2" width="8" height="10" fill="#FF7A1A" />
      </g>
      <g transform="translate(0 70)"><g>
        <rect x="-22" y="-14" width="44" height="28" rx="9" fill="#231A14" />
        <rect x="-15" y="-8" width="30" height="9" rx="3" fill="#FFEFE2" />
        <circle cx="-11" cy="14" r="4.5" fill="#fff" stroke="#231A14" strokeWidth="2" />
        <circle cx="11" cy="14" r="4.5" fill="#fff" stroke="#231A14" strokeWidth="2" />
        <animateMotion dur="9s" repeatCount="indefinite" rotate="0">
          <mpath href="#r" />
        </animateMotion>
      </g></g>
    </svg>
  );
}

const steps = [
  ["6:40 am", "Driver starts the route", "The driver taps Start. Every family on the route gets a live map, and the school sees the bus appear on its dashboard."],
  ["6:52 am", "The bus is a few stops away", "Parents get “Bus is 5 minutes away” before it arrives, so nobody waits at the curb in the cold."],
  ["6:58 am", "The student boards", "A scan on the student’s phone, a tag, or a tap from the driver. The parent sees the check-in right away."],
  ["7:21 am", "Traffic holds the bus up", "RouteIQ spots the delay and tells every affected family, with a new arrival time."],
  ["7:44 am", "Everyone is at school", "The ride closes, the day’s record is saved, and the report is ready when the district asks."],
];

const faqs = [
  ["Does the school need to buy hardware?", "No. The driver uses a phone or tablet they already carry. Students can check in with a phone, a printed code or an NFC tag, and drivers can check in any student by hand."],
  ["What if a student doesn’t have a phone?", "The driver taps “Check in” next to the student’s name. The parent gets the same boarding alert, and the school’s log shows it was a manual check-in."],
  ["How do parents find out a child isn’t riding?", "When a student marks themselves as not riding, or a parent plans an absence, the other parent accounts on that student get a notification right away."],
  ["Can drivers use the app without cell service?", "Check-ins are saved on the phone and sent as soon as the connection comes back. Locations resume the same way."],
  ["Does RouteIQ use AI, and what does it see?", "Arrival times, delay warnings, forecasts and route ideas are learned from your own ride history on your own server. The optional question box and notice writer can use Claude. Only totals, route names and driver names go to it. Student names never do, and nothing is sent to families without a person approving it."],
  ["Who can see where the bus is?", "Only the people on the route: its parents, students, the driver, the school, and the bus company. Location is shared while a ride is running and not at any other time."],
  ["Which languages does it support?", "English, Spanish and Portuguese in the app and in every notification, chosen per person."],
];

export function Landing() {
  return (
    <>
      <header className="nav">
        <div className="wrap nav-in">
          <Logo />
          <nav className="nav-links" aria-label="Sections">
            <a href="#morning">How it works</a>
            <a href="#features">Features</a>
            <a href="#who">Who it’s for</a>
            <a href="#safety">Privacy</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            <Link to="/signin" className="btn btn-outline btn-sm">Sign in</Link>
            <a href="#contact" className="btn btn-primary btn-sm">Book a demo</a>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap hero-in">
            <div>
              <h1>Know where the bus is. Always.</h1>
              <p className="lead">
                RouteIQ gives parents a live map and honest arrival times, gives drivers routes that
                fit the bus, and gives schools and bus companies one place to run it all.
              </p>
              <div className="hero-actions">
                <a href="#contact" className="btn btn-primary btn-lg">Book a demo</a>
                <Link to="/signin" className="btn btn-outline btn-lg">Sign in to your dashboard</Link>
              </div>
              <p className="hero-note">For schools and bus companies. Parents, students and drivers get the RouteIQ app on iPhone and Android.</p>
            </div>
            <div className="stage">
              <RouteMap />
              <div className="chip c1"><i>🚌</i><span>Route 12 is 6 min away<small>Maple &amp; 4th, arriving 6:52</small></span></div>
              <div className="chip c2"><i>✓</i><span>Maya boarded<small>6:58 am, Oak Street stop</small></span></div>
              <div className="chip c3"><i>⏱</i><span>Running 8 min late<small>Families notified</small></span></div>
            </div>
          </div>
        </section>

        <section className="section" id="morning">
          <div className="wrap">
            <div className="section-head">
              <h2>A morning on Route 12</h2>
              <p>This is what changes for everyone when the bus is no longer a mystery.</p>
            </div>
            <ol className="timeline">
              {steps.map(([t, h, p]) => (
                <li key={t}>
                  <time>{t}</time>
                  <span className="rail" aria-hidden="true" />
                  <div><h3>{h}</h3><p>{p}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section tinted" id="features">
          <div className="wrap">
            <div className="section-head">
              <h2>Everything a transportation office juggles, in one place</h2>
            </div>

            <div className="feature">
              <div className="feature-copy">
                <h3>Routes that fit the bus</h3>
                <p>Enter the stops. RouteIQ orders them, checks the bus’s height, width and weight against the roads, and draws the fastest route that actually works.</p>
                <ul>
                  <li>Up to 11 stops per route, morning and afternoon</li>
                  <li>Schedules start themselves at the time you set</li>
                  <li>Substitute drivers can be swapped in with one tap</li>
                </ul>
              </div>
              <div className="panel">
                <div className="mini row space"><span><b>Route 12</b> to school</span><span className="pill orange">Draft</span></div>
                <div className="mini"><div className="row space"><span>Maple &amp; 4th</span><span className="hint">6:52</span></div></div>
                <div className="mini"><div className="row space"><span>Oak Street</span><span className="hint">6:58</span></div></div>
                <div className="mini"><div className="row space"><span>Birch Lane</span><span className="hint">7:06</span></div></div>
                <div className="mini row space"><span>Bus clearance: 11 ft 2 in</span><span className="pill green">Fits</span></div>
              </div>
            </div>

            <div className="feature flip">
              <div className="feature-copy">
                <h3>Parents always know</h3>
                <p>A live map, an arrival time that updates, and a message when something changes. Alerts come in English, Spanish or Portuguese.</p>
                <ul>
                  <li>Approaching, boarded, dropped off and delay alerts</li>
                  <li>A heads-up when a child marks themselves as not riding</li>
                  <li>Adult pickup rules checked at every drop-off</li>
                </ul>
              </div>
              <div className="panel orange">
                <div className="mini" style={{ color: "var(--ink)" }}><b>Bus is 5 minutes away</b><div className="hint">Route 12 · Maple &amp; 4th</div></div>
                <div className="mini" style={{ color: "var(--ink)" }}><b>Maya boarded the bus</b><div className="hint">6:58 am</div></div>
                <div className="mini" style={{ color: "var(--ink)" }}><b>Jonah is not riding today</b><div className="hint">Marked by Jonah · morning route</div></div>
              </div>
            </div>

            <div className="feature">
              <div className="feature-copy">
                <h3>Check-in for every student</h3>
                <p>Students with phones scan a code. Students without them tap on a tag, or the driver checks them in by hand. Everyone ends up in the same record.</p>
                <ul>
                  <li>QR code, NFC tag or manual check-in by the driver</li>
                  <li>Works offline and syncs when the signal returns</li>
                  <li>A warning when a student boards the wrong bus</li>
                </ul>
              </div>
              <div className="panel">
                <div className="mini row space"><span>Ava Chen</span><span className="pill green">Boarded</span></div>
                <div className="mini row space"><span>Leo Park</span><span className="pill orange">Checked in by driver</span></div>
                <div className="mini row space"><span>Maya Singh</span><span className="pill">Waiting</span></div>
                <div className="bar" aria-hidden="true"><i style={{ width: "66%" }} /></div>
                <span className="hint">2 of 3 on board at Oak Street</span>
              </div>
            </div>

            <div className="feature flip">
              <div className="feature-copy">
                <h3>Reports the district will ask for</h3>
                <p>On-time performance, boarding rates and incidents for any date range, with CSV exports and an activity log of who changed what.</p>
                <ul>
                  <li>On-time rate and average lateness per route</li>
                  <li>Roster import from a spreadsheet, with a preview</li>
                  <li>Every sensitive action is recorded in an audit log</li>
                </ul>
              </div>
              <div className="panel">
                <div className="row space"><b>Last 30 days</b><span className="pill orange">Export CSV</span></div>
                <div className="mini row space"><span>On-time rides</span><b>96%</b></div>
                <div className="mini row space"><span>Students boarded</span><b>98%</b></div>
                <div className="mini row space"><span>Incidents</span><b>3</b></div>
              </div>
            </div>

            <div className="feature">
              <div className="feature-copy">
                <h3>Arrival times that learn your routes</h3>
                <p>RouteIQ remembers how long each stretch really takes at each time of day, stops and traffic included. Estimates get closer with every ride, and families hear about a late bus while it is still running, not after.</p>
                <ul>
                  <li>Per-stop times learned from your own rides</li>
                  <li>“Running about 8 min behind” sent early, once, and only if it gets worse</li>
                  <li>Expected riders each day, from each student’s usual pattern</li>
                  <li>A flag when a ride runs long, a route starts late, or a regular rider stops showing up</li>
                </ul>
              </div>
              <div className="panel">
                <div className="mini row space"><span>Oak Street, usual arrival</span><b>6:58</b></div>
                <div className="mini row space"><span>Today, on current pace</span><b>7:06</b></div>
                <div className="mini row space"><span>Families told</span><span className="pill amber">8 min behind usual</span></div>
                <div className="mini row space"><span>Expected riders today</span><b>14 of 18</b></div>
              </div>
            </div>

            <div className="feature flip">
              <div className="feature-copy">
                <h3>Ask your routes a question</h3>
                <p>Type what you want to know and get an answer from your own records. Draft a notice to families in a few words, review it, and send it in English, Spanish and Portuguese.</p>
                <ul>
                  <li>“Which routes were late most this month?”</li>
                  <li>“Which two routes could share a bus?”</li>
                  <li>Route ideas: merge nearby stops, spot overlap, find full buses</li>
                  <li>Nothing is sent or changed until a person approves it</li>
                </ul>
              </div>
              <div className="panel">
                <div className="mini"><b>Which routes were late most this month?</b></div>
                <div className="mini">Route 12 was on time 82% of the time, the lowest. Route 7 was on time 97%.<div className="hint" style={{ marginTop: 6 }}>Answered from your ride records</div></div>
                <div className="mini row space"><span>Draft: “Bus 12 is about 15 minutes late.”</span><span className="pill orange">EN · ES · PT</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="who">
          <div className="wrap">
            <div className="section-head"><h2>One product, four different jobs</h2></div>
            <div className="audience">
              <div><h3>Bus companies</h3><p>Build routes, assign drivers, run substitutes, and watch every bus in the fleet from one screen.</p></div>
              <div><h3>Schools</h3><p>See which buses are running, manage rosters and stop assignments, and answer “where’s my kid?” without a phone call.</p></div>
              <div><h3>Drivers</h3><p>Turn-by-turn routes that fit the bus, a simple stop list, and check-in that works with or without a student’s phone.</p></div>
              <div><h3>Parents and students</h3><p>A live map, alerts that matter, absence planning, and a ride history, in the language they speak at home.</p></div>
            </div>
          </div>
        </section>

        <section className="section tinted" id="safety">
          <div className="wrap privacy">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h2>Built for kids’ data</h2>
              <p>Location is only shared while a ride is running, and only with the people on that route.</p>
            </div>
            <dl>
              <div><dt>Role-based access</dt><dd>Parents see their own children. Schools see their own students. Companies see their own fleet.</dd></div>
              <div><dt>An audit trail</dt><dd>Check-ins, assignments, imports and exports are logged with who did them and when.</dd></div>
              <div><dt>Your data stays yours</dt><dd>Families can download or delete their data, and tokens expire and rotate so a lost phone can be signed out.</dd></div>
            </dl>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="wrap">
            <div className="section-head"><h2>Questions we hear first</h2></div>
            <div className="faq">
              {faqs.map(([q, a]) => (
                <details key={q}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="contact" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="cta">
              <div>
                <h2>See your routes in RouteIQ</h2>
                <p>Tell us about your fleet and we’ll set up a walkthrough with your own stops and schools.</p>
              </div>
              <div className="actions">
                <a className="btn btn-primary btn-lg" href="mailto:hello@routeiq.example?subject=RouteIQ%20demo">Email us for a demo</a>
                <Link className="btn btn-outline btn-lg" to="/signin">Sign in</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-in">
          <div><Logo /><p style={{ marginTop: 8 }}>School bus tracking and route planning.</p></div>
          <div>
            <p>hello@routeiq.example</p>
            <p><Link to="/signin">Dashboard sign in</Link></p>
          </div>
        </div>
      </footer>
    </>
  );
}
