"use client";

import { useEffect, useState } from "react";

interface Counts {
  activities: number;
  habits: number;
  goals: number;
}

export default function AdminOverview() {
  const [counts, setCounts] = useState<Counts>({ activities: 0, habits: 0, goals: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [actRes, habRes, goalRes] = await Promise.all([
          fetch("/api/admin/activities"),
          fetch("/api/admin/habits"),
          fetch("/api/admin/goals"),
        ]);
        const [actData, habData, goalData] = await Promise.all([
          actRes.json(),
          habRes.json(),
          goalRes.json(),
        ]);
        setCounts({
          activities: actData.activities?.length || 0,
          habits: habData.habits?.length || 0,
          goals: goalData.goals?.length || 0,
        });
      } catch {
        // Counts stay at 0
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="timeline-empty">Loading...</p>;

  return (
    <main id="main-content" tabIndex={-1}>
      <h2 className="admin-section-title">Admin Overview</h2>
      <div className="period-stats">
        <div className="stat-card">
          <span className="stat-value">{counts.activities}</span>
          <span className="stat-label">Manual Activities</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{counts.habits}</span>
          <span className="stat-label">Habits</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{counts.goals}</span>
          <span className="stat-label">Goals</span>
        </div>
      </div>
    </main>
  );
}
