"use client";

import { useState } from "react";

interface GoalFormProps {
  initial?: {
    id?: number;
    name: string;
    start_date: string;
    end_date: string;
    target_value: number;
    target_unit: string;
    filters: { source?: string; category?: string; kind?: string };
    visibility: string;
    status: string;
  };
  onSave: () => void;
}

export default function GoalForm({ initial, onSave }: GoalFormProps) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    start_date: initial?.start_date || new Date().toISOString().split("T")[0],
    end_date: initial?.end_date || "",
    target_value: initial?.target_value || 100,
    target_unit: initial?.target_unit || "count",
    filter_source: initial?.filters?.source || "",
    filter_category: initial?.filters?.category || "",
    filter_kind: initial?.filters?.kind || "",
    visibility: initial?.visibility || "public",
    status: initial?.status || "active",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const filters: Record<string, string> = {};
      if (form.filter_source) filters.source = form.filter_source;
      if (form.filter_category) filters.category = form.filter_category;
      if (form.filter_kind) filters.kind = form.filter_kind;

      const payload = {
        ...(initial?.id ? { id: initial.id } : {}),
        name: form.name,
        start_date: form.start_date,
        end_date: form.end_date,
        target_value: form.target_value,
        target_unit: form.target_unit,
        filters,
        visibility: form.visibility,
        status: form.status,
      };

      const res = await fetch("/api/admin/goals", {
        method: initial?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label" htmlFor="goal-name">Name</label>
        <input
          id="goal-name"
          className="form-input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="goal-start">Start Date</label>
          <input
            id="goal-start"
            type="date"
            className="form-input"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="goal-end">End Date</label>
          <input
            id="goal-end"
            type="date"
            className="form-input"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="goal-target">Target Value</label>
          <input
            id="goal-target"
            type="number"
            className="form-input"
            value={form.target_value}
            onChange={(e) => setForm({ ...form, target_value: Number(e.target.value) })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="goal-unit">Target Unit</label>
          <input
            id="goal-unit"
            className="form-input"
            value={form.target_unit}
            onChange={(e) => setForm({ ...form, target_unit: e.target.value })}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="goal-vis">Visibility</label>
          <select
            id="goal-vis"
            className="form-select"
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
        {initial?.id && (
          <div className="form-group">
            <label className="form-label" htmlFor="goal-status">Status</label>
            <select
              id="goal-status"
              className="form-select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="goal-fsrc">Filter: Source</label>
          <input
            id="goal-fsrc"
            className="form-input"
            value={form.filter_source}
            onChange={(e) => setForm({ ...form, filter_source: e.target.value })}
            placeholder="e.g. github"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="goal-fkind">Filter: Kind</label>
          <input
            id="goal-fkind"
            className="form-input"
            value={form.filter_kind}
            onChange={(e) => setForm({ ...form, filter_kind: e.target.value })}
            placeholder="e.g. commit_pushed"
          />
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
