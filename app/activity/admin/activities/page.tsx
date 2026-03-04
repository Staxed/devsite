"use client";

import { useEffect, useState, useCallback } from "react";
import ActivityForm from "@/components/admin/activity-form";
import type { ActivityEvent } from "@/lib/supabase/types";

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [editing, setEditing] = useState<ActivityEvent | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/activities");
    const data = await res.json();
    setActivities(data.activities || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSave() {
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this activity?")) return;
    await fetch(`/api/admin/activities?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="admin-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 className="admin-section-title" style={{ margin: 0 }}>Manual Activities</h2>
          <button
            className="btn-admin btn-admin-primary"
            onClick={() => { setEditing(null); setShowForm(!showForm); }}
          >
            {showForm ? "Cancel" : "+ New Activity"}
          </button>
        </div>

        {showForm && (
          <ActivityForm
            initial={editing ? {
              id: editing.id,
              category: editing.category,
              kind: editing.kind,
              value: editing.value,
              unit: editing.unit,
              title: editing.title || "",
              occurred_at: editing.occurred_at,
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
          {activities.map((act) => (
            <div key={act.id} className="admin-list-item">
              <div>
                <div className="admin-list-item-title">{act.title || `${act.category}/${act.kind}`}</div>
                <div className="admin-list-item-meta">
                  {act.category} / {act.kind} &middot; {act.value} {act.unit} &middot; {new Date(act.occurred_at).toLocaleDateString()}
                </div>
              </div>
              <div className="admin-list-actions">
                <button
                  className="btn-admin btn-admin-primary"
                  onClick={() => { setEditing(act); setShowForm(true); }}
                >
                  Edit
                </button>
                <button
                  className="btn-admin btn-admin-danger"
                  onClick={() => handleDelete(act.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {activities.length === 0 && <p className="timeline-empty">No manual activities yet.</p>}
        </div>
      )}
    </main>
  );
}
