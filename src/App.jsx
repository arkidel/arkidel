import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import RedirectIfAuthed from "./auth/RedirectIfAuthed.jsx";
import { OrgProvider } from "./org/OrgProvider.jsx";
import RequireOrg from "./org/RequireOrg.jsx";
import Layout from "./components/Layout.jsx";
import AppShell from "./components/AppShell.jsx";
import Landing from "./pages/Landing.jsx";
import About from "./pages/About.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import SignIn from "./pages/SignIn.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import AppArea from "./pages/AppArea.jsx";
import BreachClock from "./breach-clock/BreachClock.jsx";
import Incidents from "./pages/Incidents.jsx";
import Account from "./pages/Account.jsx";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Authed boundary: one session gate and ONE app-wide OrgProvider.
              Every signed-in surface — /app and the AppShell tool routes —
              nests under this route, so org state is fetched once and shared;
              navigating between routes never remounts the provider. */}
          <Route
            element={
              <RequireAuth>
                <OrgProvider>
                  <Outlet />
                </OrgProvider>
              </RequireAuth>
            }
          >
            {/* Respond runs inside the signed-in app shell (left module rail),
                not the marketing masthead/footer. Tool routes additionally sit
                behind RequireOrg (signed in, no org -> /app, which renders the
                existing org-onboarding gate). */}
            <Route element={<AppShell />}>
              {/* Respond's home is the incidents list. */}
              <Route
                path="/breach-clock"
                element={
                  <RequireOrg>
                    <Incidents />
                  </RequireOrg>
                }
              />
              {/* Fresh intake form. "new" is a static segment, which ranks
                  above the dynamic :id — it is never captured as an :id param.
                  The /new and /:id routes render the SAME element tree at the
                  same route position, so the first save's
                  navigate(/breach-clock/new -> /breach-clock/<id>) reconciles
                  the BreachClock instance in place — no remount, no loss of
                  the just-entered state or the "Saved" confirmation (the
                  guarantee the former optional-:id single route provided). */}
              <Route
                path="/breach-clock/new"
                element={
                  <RequireOrg>
                    <BreachClock />
                  </RequireOrg>
                }
              />
              <Route
                path="/breach-clock/:id"
                element={
                  <RequireOrg>
                    <BreachClock />
                  </RequireOrg>
                }
              />
              {/* The list moved to /breach-clock; old links and bookmarks
                  keep working via a route-level redirect. */}
              <Route path="/incidents" element={<Navigate to="/breach-clock" replace />} />
              {/* Account needs a session but not an org — no RequireOrg. */}
              <Route path="/account" element={<Account />} />
              {/* /app renders inside the shell so the top bar can carry the
                  org name and the rail's AccountMenu owns sign-out. AppArea
                  keeps its own org gate (loading / onboarding / home), so no
                  RequireOrg here. */}
              <Route path="/app" element={<AppArea />} />
            </Route>
          </Route>
          <Route element={<Layout />}>
            {/* Public routes — open, never wrapped in RequireAuth. The landing
                and sign-in pages are inverted: a signed-in visitor is forwarded
                to /app instead of seeing the marketing front page or the
                sign-in form. /auth/callback deliberately stays unguarded — the
                magic-link callback must run for the sign-in flow itself. */}
            <Route
              path="/"
              element={
                <RedirectIfAuthed>
                  <Landing />
                </RedirectIfAuthed>
              }
            />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route
              path="/sign-in"
              element={
                <RedirectIfAuthed>
                  <SignIn />
                </RedirectIfAuthed>
              }
            />
          </Route>
          {/* Magic-link landing, rendered bare (no marketing chrome). */}
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
