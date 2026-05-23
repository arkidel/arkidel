import { Link, Outlet } from "react-router-dom";

function ArkidelLogo({ className }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
      <rect x="10" y="10" width="80" height="80" rx="8" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
      <line x1="50" y1="22" x2="50" y2="78" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="38" x2="72" y2="28" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="62" x2="72" y2="72" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M 38 42 L 24 50 L 38 58 Z" fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-bone text-midnight font-sans">
      <header className="bg-midnight text-bone px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 text-parchment no-underline">
            <ArkidelLogo className="w-7 h-7" />
            <span className="font-serif text-xl">Arkidel</span>
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
          <span className="font-serif text-parchment">Arkidel</span>
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
