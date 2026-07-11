// Top-bar header slot: the contract between AppShell and its routed pages.
//
// AppShell owns the bar and provides a setter through this context; a page
// declares its header by calling useTopBarHeader({ eyebrow, title }). The
// value is set via effect and cleared on unmount, so navigating away never
// leaves a stale title in the bar. Both fields are optional — a page that
// sets neither (or never calls the hook) leaves the slot empty.

import { createContext, useContext, useEffect } from "react";

// Default null makes the hook a harmless no-op anywhere the shell isn't
// mounted (a page rendered outside AppShell, tests, etc.).
const TopBarContext = createContext(null);

export function useTopBarHeader({ eyebrow, title } = {}) {
  const setHeader = useContext(TopBarContext);
  useEffect(() => {
    if (!setHeader) return undefined;
    setHeader({ eyebrow, title });
    return () => setHeader(null);
  }, [setHeader, eyebrow, title]);
}

export default TopBarContext;
