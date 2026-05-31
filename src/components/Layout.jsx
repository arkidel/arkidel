import { Link, Outlet } from "react-router-dom";
import ArkidelLogo from "./ArkidelLogo.jsx";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-bone text-midnight font-sans">
      <header className="bg-midnight text-bone px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 text-parchment no-underline">
            <ArkidelLogo className="w-7 h-7" />
            <span className="font-serif text-xl tracking-[1.2px]" style={{ transform: "translateY(2px)" }}>Arkidel</span>
          </Link>
          <nav className="flex items-center gap-8 text-sm">
            <Link to="/breach-clock" className="text-bone hover:text-parchment transition-colors no-underline whitespace-nowrap">
              Breach Clock
            </Link>
            <Link to="/about" className="text-bone hover:text-parchment transition-colors no-underline whitespace-nowrap">
              About
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-midnight text-bone px-8 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm">
          <span className="font-serif text-parchment tracking-[1.2px]" style={{ transform: "translateY(2px)" }}>Arkidel</span>
          <nav className="flex gap-6">
            <Link to="/privacy" className="text-bone hover:text-parchment transition-colors no-underline">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-bone hover:text-parchment transition-colors no-underline">
              Terms of Service
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
