import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isStaff, useAuth } from "./lib/auth";
import { Spinner } from "./components/ui";
import { Landing } from "./pages/Landing";
import { SignIn } from "./pages/SignIn";
import { Layout } from "./dashboard/Layout";
import { Overview } from "./dashboard/Overview";
import { RoutesPage } from "./dashboard/RoutesPage";
import { RouteDetail } from "./dashboard/RouteDetail";
import { Team } from "./dashboard/Team";
import { Students } from "./dashboard/Students";
import { Reports } from "./dashboard/Reports";
import { Activity } from "./dashboard/Activity";
import { Insights } from "./dashboard/Insights";
import { Ask } from "./dashboard/Ask";
import { Alerts } from "./dashboard/Alerts";
import { Account } from "./dashboard/Account";

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Guard({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen"><Spinner /></div>;
  if (!isStaff(user)) return <Navigate to="/signin" replace />;
  return children;
}

export function App() {
  const { user, loading } = useAuth();
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/signin"
          element={!loading && isStaff(user) ? <Navigate to="/app" replace /> : <SignIn />}
        />
        <Route path="/app" element={<Guard><Layout /></Guard>}>
          <Route index element={<Overview />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="routes/:id" element={<RouteDetail />} />
          <Route path="team" element={<Team />} />
          <Route path="students" element={<Students />} />
          <Route path="insights" element={<Insights />} />
          <Route path="ask" element={<Ask />} />
          <Route path="reports" element={<Reports />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="activity" element={<Activity />} />
          <Route path="account" element={<Account />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
