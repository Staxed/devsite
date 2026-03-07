import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import AppKitProvider from "@/components/providers/appkit-provider";

export const metadata: Metadata = {
  title: "Activity",
  description: "Public activity dashboard — GitHub commits, streaks, and goals.",
};

export default function ActivityLayout({ children }: { children: ReactNode }) {
  return (
    <AppKitProvider>
      <div className="activity-layout">
        <header className="activity-header">
          <Link href="/" className="activity-back-link">
            &larr; staxed.dev
          </Link>
          <h1 className="activity-title">
            <span className="gradient-text">Activity</span>
          </h1>
        </header>
        {children}
      </div>
    </AppKitProvider>
  );
}
