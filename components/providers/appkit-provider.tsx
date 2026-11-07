"use client";

import { useEffect, type ReactNode } from "react";

// Loads the wallet kit in the browser only; see appkit-setup.ts.
export default function AppKitProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    import("./appkit-setup");
  }, []);

  return <>{children}</>;
}
