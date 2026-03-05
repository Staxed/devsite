"use client";

import { useEffect, useState, useCallback } from "react";
import type { Quote } from "@/lib/supabase/types";

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/quotes");
    const data = await res.json();
    setQuotes(data.quotes || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setText("");
    setAuthor("");
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    if (editingId) {
      await fetch("/api/admin/quotes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, text, author }),
      });
    } else {
      await fetch("/api/admin/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author }),
      });
    }
    resetForm();
    load();
  }

  async function handleToggleActive(quote: Quote) {
    await fetch("/api/admin/quotes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: quote.id, is_active: !quote.is_active }),
    });
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this quote?")) return;
    await fetch(`/api/admin/quotes?id=${id}`, { method: "DELETE" });
    load();
  }

  function startEdit(quote: Quote) {
    setEditingId(quote.id);
    setText(quote.text);
    setAuthor(quote.author || "");
    setShowForm(true);
  }

  const activeCount = quotes.filter((q) => q.is_active).length;

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="admin-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 className="admin-section-title" style={{ margin: 0 }}>
            Quotes ({activeCount} active / {quotes.length} total)
          </h2>
          <button
            className="btn-admin btn-admin-primary"
            onClick={() => { resetForm(); setShowForm(!showForm); }}
          >
            {showForm ? "Cancel" : "+ New Quote"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="admin-form" style={{ marginBottom: "1.5rem" }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="quote-text" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
                Quote Text *
              </label>
              <textarea
                id="quote-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
                rows={3}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="quote-author" style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
                Author
              </label>
              <input
                id="quote-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Anonymous"
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
              />
            </div>
            <button type="submit" className="btn-admin btn-admin-primary">
              {editingId ? "Update Quote" : "Add Quote"}
            </button>
          </form>
        )}
      </div>

      {loading ? (
        <p className="timeline-empty">Loading...</p>
      ) : (
        <div className="admin-list">
          {quotes.map((quote) => (
            <div key={quote.id} className="admin-list-item">
              <div style={{ flex: 1 }}>
                <div className="admin-list-item-title">
                  &ldquo;{quote.text}&rdquo;
                  {!quote.is_active && <span style={{ color: "var(--color-text-muted)", marginLeft: "0.5rem" }}>(inactive)</span>}
                </div>
                <div className="admin-list-item-meta">
                  {quote.author || "Anonymous"}
                </div>
              </div>
              <div className="admin-list-actions">
                <button
                  className="btn-admin"
                  onClick={() => handleToggleActive(quote)}
                  title={quote.is_active ? "Deactivate" : "Activate"}
                >
                  {quote.is_active ? "Disable" : "Enable"}
                </button>
                <button
                  className="btn-admin btn-admin-primary"
                  onClick={() => startEdit(quote)}
                >
                  Edit
                </button>
                <button
                  className="btn-admin btn-admin-danger"
                  onClick={() => handleDelete(quote.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {quotes.length === 0 && <p className="timeline-empty">No quotes yet.</p>}
        </div>
      )}
    </main>
  );
}
