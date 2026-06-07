import { Link, Outlet } from "react-router-dom";
import ArkidelLogo from "./ArkidelLogo.jsx";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-bone text-midnight font-sans">
      <header className="bg-midnight text-bone px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-[17px] text-parchment no-underline">
            <ArkidelLogo className="w-[39px] h-[39px]" />
            <span className="font-serif text-[28px] leading-9 tracking-[1.2px]" style={{ transform: "translateY(2.6px)" }}>Arkidel</span>
          </Link>
          <nav className="flex items-center gap-8 text-sm">
            <Link to="/breach-clock" className="text-bone hover:text-parchment transition-colors no-underline whitespace-nowrap">
              Respond
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
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-[9px] text-parchment">
              <ArkidelLogo className="w-5 h-5" />
              <span className="font-serif text-sm tracking-[1.2px]" style={{ transform: "translateY(1.3px)" }}>Arkidel</span>
            </span>
            <nav className="flex gap-6">
              <Link to="/privacy" className="text-bone hover:text-parchment transition-colors no-underline">
                Privacy Policy
              </Link>
              <Link to="/terms" className="text-bone hover:text-parchment transition-colors no-underline">
                Terms of Service
              </Link>
            </nav>
          </div>
          <p className="mt-6 pt-6 border-t border-mist/20 text-[13px] leading-relaxed text-mist max-w-3xl">
            Arkidel is a privacy compliance tool. It does not give legal advice. All output from Arkidel should be reviewed by qualified counsel.
          </p>
        </div>
      </footer>
    </div>
  );
}
