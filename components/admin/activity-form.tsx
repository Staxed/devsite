"use client";

import { useState } from "react";

interface ActivityFormProps {
  initial?: {
    id?: number;
    category: string;
    kind: string;
    value: number;
    unit: string;
    title: string;
    occurred_at: string;
    visibility: string;
  };
  onSave: () => void;
}

export default function ActivityForm({ initial, onSave }: ActivityFormProps) {
  const [form, setForm] = useState({
    category: initial?.category || "",
    kind: initial?.kind || "",
    value: initial?.value || 1,
    unit: initial?.unit || "count",
    title: initial?.title || "",
    occurred_at: initial?.occurred_at?.slice(0, 16) || new Date().toISOString().slice(0, 16),
    visibility: initial?.visibility || "public",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const method = initial?.id ? "PUT" : "POST";
      const body = initial?.id ? { id: initial.id, ...form } : form;
      const res = await fetch("/api/admin/activities", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="act-category">Category</label>
          <input
            id="act-category"
            className="form-input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="act-kind">Kind</label>
          <input
            id="act-kind"
            className="form-input"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="act-value">Value</label>
          <input
            id="act-value"
            type="number"
            className="form-input"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="act-unit">Unit</label>
          <input
            id="act-unit"
            className="form-input"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="act-title">Title</label>
        <input
          id="act-title"
          className="form-input"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="act-time">When</label>
          <input
            id="act-time"
            type="datetime-local"
            className="form-input"
            value={form.occurred_at}
            onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="act-vis">Visibility</label>
          <select
            id="act-vis"
            className="form-select"
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-admin btn-admin-primary" disabled={saving}>
          {saving ? "Saving..." : initial?.id ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}
