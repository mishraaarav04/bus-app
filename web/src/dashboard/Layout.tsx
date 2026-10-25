import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Icon, Logo } from "../components/ui";

export function Layout() {
  const { user, signOut } = useAuth();
  const [unread, setUnread] = useState(0);
  const company = user?.role === "company";

  useEffect(() => {
    const load = () => api.notifications().then((r) => setUnread(r.unread)).catch(() => {});
    load();
    const s = getSocket();
    s?.on("notification:new", load);
    return () => {
      s?.off("notification:new", load);
    };
  }, []);

  const items: [string, string, Parameters<typeof Icon>[0]["name"], boolean][] = [
    ["/app", "Live overview", "home", true],
    ["/app/routes", "Routes", "route", true],
    ["/app/team", "Drivers & schools", "team", company],
    ["/app/students", "Students", "kids", !company],
    ["/app/insights", "Insights", "spark", true],
    ["/app/ask", "Ask RouteIQ", "ask", true],
    ["/app/reports", "Reports", "chart", true],
    ["/app/alerts", "Alerts", "bell", true],
    ["/app/activity", "Activity log", "list", true],
    ["/app/account", "Account", "user", true],
  ];

  return (
    <div className="dash">
      <aside className="side">
        <Logo to="/app" />
        <nav aria-label="Dashboard">
          {items.filter((i) => i[3]).map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === "/app"} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <Icon name={icon} />
              <span className="lbl">{label}</span>
              {icon === "bell" && unread > 0 && <span className="badge">{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <b>{user?.name}</b>
          <span>{company ? "Bus company" : "School"}</span>
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm btn-soft" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
