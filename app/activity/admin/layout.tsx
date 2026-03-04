"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const adminLinks = [
  { href: "/activity/admin", label: "Overview" },
  { href: "/activity/admin/activities", label: "Activities" },
  { href: "/activity/admin/habits", label: "Habits" },
  { href: "/activity/admin/goals", label: "Goals" },
  { href: "/activity/admin/backfill", label: "Backfill" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
      {children}
    </div>
  );
}
