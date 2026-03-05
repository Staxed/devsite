"use client";

import { useEffect, useState, useCallback } from "react";
import GoalForm from "@/components/admin/goal-form";
import type { Goal } from "@/lib/supabase/types";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/goals");
    const data = await res.json();
    setGoals(data.goals || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSave() {
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this goal?")) return;
    await fetch(`/api/admin/goals?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="admin-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 className="admin-section-title" style={{ margin: 0 }}>Goals</h2>
          <button
            className="btn-admin btn-admin-primary"
            onClick={() => { setEditing(null); setShowForm(!showForm); }}
          >
            {showForm ? "Cancel" : "+ New Goal"}
          </button>
        </div>

        {showForm && (
          <GoalForm
            initial={editing ? {
              id: editing.id,
              name: editing.name,
              start_date: editing.start_date,
              end_date: editing.end_date,
              target_value: editing.target_value,
              target_unit: editing.target_unit,
              filters: editing.filters,
              visibility: editing.visibility,
              status: editing.status,
            } : undefined}
            onSave={handleSave}
          />
        )}
      </div>

      {loading ? (
        <p className="timeline-empty">Loading...</p>
      ) : (
        <div className="admin-list">
          {goals.map((goal) => (
            <div key={goal.id} className="admin-list-item">
              <div>
                <div className="admin-list-item-title">
                  {goal.name}
                  <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    [{goal.status}]
                  </span>
                </div>
                <div className="admin-list-item-meta">
                  {goal.start_date} to {goal.end_date} &middot; {goal.target_value} {goal.target_unit} &middot; {goal.visibility}
                </div>
              </div>
              <div className="admin-list-actions">
                <button
                  className="btn-admin btn-admin-primary"
                  onClick={() => { setEditing(goal); setShowForm(true); }}
                >
                  Edit
                </button>
                <button
                  className="btn-admin btn-admin-danger"
                  onClick={() => handleDelete(goal.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {goals.length === 0 && <p className="timeline-empty">No goals yet.</p>}
        </div>
      )}
    </main>
  );
}
