"use client";

import { useState } from "react";

interface HabitFormProps {
  initial?: {
    id?: number;
    name: string;
    rule_type: string;
    target_value: number;
    target_unit: string;
    window_days: number | null;
    filters: { source?: string; category?: string; kind?: string };
    visibility: string;
  };
  onSave: () => void;
}

export default function HabitForm({ initial, onSave }: HabitFormProps) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    rule_type: initial?.rule_type || "daily",
    target_value: initial?.target_value || 1,
    target_unit: initial?.target_unit || "count",
    window_days: initial?.window_days || 7,
    filter_source: initial?.filters?.source || "",
    filter_category: initial?.filters?.category || "",
    filter_kind: initial?.filters?.kind || "",
    visibility: initial?.visibility || "public",
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
        rule_type: form.rule_type,
        target_value: form.target_value,
        target_unit: form.target_unit,
        window_days: form.rule_type === "rolling" ? form.window_days : null,
        filters,
        visibility: form.visibility,
      };

      const res = await fetch("/api/admin/habits", {
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
        <label className="form-label" htmlFor="hab-name">Name</label>
        <input
          id="hab-name"
          className="form-input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="hab-rule">Rule Type</label>
          <select
            id="hab-rule"
            className="form-select"
            value={form.rule_type}
            onChange={(e) => setForm({ ...form, rule_type: e.target.value })}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="rolling">Rolling Window</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="hab-vis">Visibility</label>
          <select
            id="hab-vis"
            className="form-select"
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="hab-target">Target Value</label>
          <input
            id="hab-target"
            type="number"
            className="form-input"
            value={form.target_value}
            onChange={(e) => setForm({ ...form, target_value: Number(e.target.value) })}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="hab-unit">Target Unit</label>
          <input
            id="hab-unit"
            className="form-input"
            value={form.target_unit}
            onChange={(e) => setForm({ ...form, target_unit: e.target.value })}
          />
        </div>
      </div>
      {form.rule_type === "rolling" && (
        <div className="form-group">
          <label className="form-label" htmlFor="hab-window">Window (days)</label>
          <input
            id="hab-window"
            type="number"
            className="form-input"
            value={form.window_days}
            onChange={(e) => setForm({ ...form, window_days: Number(e.target.value) })}
          />
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="hab-fsrc">Filter: Source</label>
          <input
            id="hab-fsrc"
            className="form-input"
            value={form.filter_source}
            onChange={(e) => setForm({ ...form, filter_source: e.target.value })}
            placeholder="e.g. github"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="hab-fkind">Filter: Kind</label>
          <input
            id="hab-fkind"
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
