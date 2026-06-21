import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import Layout from "./components/Layout.jsx";
import Landing from "./pages/Landing.jsx";
import About from "./pages/About.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import SignIn from "./pages/SignIn.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import AppArea from "./pages/AppArea.jsx";
import BreachClock from "./breach-clock/BreachClock.jsx";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Public routes — open, never wrapped in RequireAuth. */}
            <Route path="/" element={<Landing />} />
            <Route path="/breach-clock" element={<BreachClock />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/sign-in" element={<SignIn />} />
            {/* Authenticated area — gated on auth, then on org membership. */}
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <AppArea />
                </RequireAuth>
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
