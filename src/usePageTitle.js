import { useEffect } from "react";

// Per-route document title, no router/helmet dependency. Each page calls this
// once. Passing nothing yields the bare base title ("Arkidel", used on the
// Landing route); passing a label yields "<label> — Arkidel". The static
// <title> in index.html remains as the pre-hydration fallback default.
const BASE_TITLE = "Arkidel";

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — ${BASE_TITLE}` : BASE_TITLE;
  }, [title]);
}
