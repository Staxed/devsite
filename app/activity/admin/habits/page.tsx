"use client";

import { useEffect, useState, useCallback } from "react";
import HabitForm from "@/components/admin/habit-form";
import type { Habit } from "@/lib/supabase/types";

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/habits");
    const data = await res.json();
    setHabits(data.habits || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSave() {
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this habit?")) return;
    await fetch(`/api/admin/habits?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="admin-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 className="admin-section-title" style={{ margin: 0 }}>Habits</h2>
          <button
            className="btn-admin btn-admin-primary"
            onClick={() => { setEditing(null); setShowForm(!showForm); }}
          >
            {showForm ? "Cancel" : "+ New Habit"}
          </button>
        </div>

        {showForm && (
          <HabitForm
            initial={editing ? {
              id: editing.id,
              name: editing.name,
              rule_type: editing.rule_type,
              target_value: editing.target_value,
              target_unit: editing.target_unit,
              window_days: editing.window_days,
              filters: editing.filters,
              visibility: editing.visibility,
            } : undefined}
            onSave={handleSave}
          />
        )}
      </div>

      {loading ? (
        <p className="timeline-empty">Loading...</p>
      ) : (
        <div className="admin-list">
          {habits.map((habit) => (
            <div key={habit.id} className="admin-list-item">
              <div>
                <div className="admin-list-item-title">
                  {habit.name}
                  {!habit.is_active && <span style={{ color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>(inactive)</span>}
                </div>
                <div className="admin-list-item-meta">
                  {habit.rule_type} &middot; {habit.target_value} {habit.target_unit} &middot; {habit.visibility}
                </div>
              </div>
              <div className="admin-list-actions">
                <button
                  className="btn-admin btn-admin-primary"
                  onClick={() => { setEditing(habit); setShowForm(true); }}
                >
                  Edit
                </button>
                <button
                  className="btn-admin btn-admin-danger"
                  onClick={() => handleDelete(habit.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {habits.length === 0 && <p className="timeline-empty">No habits yet.</p>}
        </div>
      )}
    </main>
  );
}
