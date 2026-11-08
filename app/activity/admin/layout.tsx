"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getSession } from "next-auth/react";
import { ADMIN_SESSION_EVENT } from "@/lib/auth/siwe-config";
import Link from "next/link";
import { usePathname } from "next/navigation";

const adminLinks = [
  { href: "/activity/admin", label: "Overview" },
  { href: "/activity/admin/activities", label: "Activities" },
  { href: "/activity/admin/habits", label: "Habits" },
  { href: "/activity/admin/goals", label: "Goals" },
  { href: "/activity/admin/quotes", label: "Quotes" },
  { href: "/activity/admin/backfill", label: "Backfill" },
  { href: "/activity/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Only the admin wallet can get a session (authorize refuses every other address),
  // and every /api/admin route checks it again, so a session with an address is enough here.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () =>
      getSession()
        .then((session) => setSignedIn(Boolean(session?.address)))
        .catch(() => setSignedIn(false));
    check();
    window.addEventListener(ADMIN_SESSION_EVENT, check);
    return () => window.removeEventListener(ADMIN_SESSION_EVENT, check);
  }, []);

  return (
    <div className="admin-layout">
      <nav className="admin-nav" aria-label="Admin navigation">
        <div className="admin-nav-links">
          {adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`admin-nav-link${
                pathname === link.href ? " admin-nav-link-active" : ""
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="admin-nav-actions">
          <appkit-button size="sm" />
        </div>
      </nav>
      {signedIn === null && <p className="admin-gate">Checking sign-in…</p>}
      {signedIn === false && (
        <div className="admin-gate">
          <h2>This is an admin page</h2>
          <p>You are not signed in. Connect the admin wallet and sign the message to continue.</p>
          <appkit-button />
        </div>
      )}
      {signedIn && children}
    </div>
  );
}
