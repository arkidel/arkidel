import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
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
              <Route
                path="/breach-clock"
                element={
                  <RequireOrg>
                    <BreachClock />
                  </RequireOrg>
                }
              />
              {/* Account needs a session but not an org — no RequireOrg. */}
              <Route path="/account" element={<Account />} />
            </Route>
            {/* /app keeps the marketing masthead/footer chrome. */}
            <Route element={<Layout />}>
              <Route path="/app" element={<AppArea />} />
            </Route>
          </Route>
          <Route element={<Layout />}>
            {/* Public routes — open, never wrapped in RequireAuth. The landing
                page alone is inverted: a signed-in visitor is forwarded into
                the app instead of seeing the marketing front page. */}
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
            <Route path="/sign-in" element={<SignIn />} />
          </Route>
          {/* Magic-link landing, rendered bare (no marketing chrome). */}
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
