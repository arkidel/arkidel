import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Landing from "./pages/Landing.jsx";
import About from "./pages/About.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import BreachClock from "./breach-clock/BreachClock.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Breach Clock renders without the site layout — preserves its own full-page design */}
        <Route path="/breach-clock" element={<BreachClock />} />

        {/* Marketing pages share the site-wide header/footer via Layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
