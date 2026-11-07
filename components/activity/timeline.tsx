import type { TimelineRow } from "@/lib/activity/view";

const kindIcons: Record<string, { icon: string; color: string }> = {
  commit_pushed: { icon: "⚡", color: "var(--color-accent-gold)" },
  pr_opened: { icon: "↗", color: "var(--color-accent-sky)" },
  pr_merged: { icon: "✓", color: "var(--color-accent-sky)" },
  pr_closed: { icon: "✕", color: "var(--color-accent-pink)" },
  issue_opened: { icon: "○", color: "var(--color-accent-pink)" },
  issue_closed: { icon: "●", color: "var(--color-accent-pink)" },
  release_published: { icon: "★", color: "var(--color-accent-orange)" },
};

function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Timeline({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="timeline-empty">
        <p>No activity yet. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="timeline" role="list" aria-label="Activity timeline">
      {rows.map((row) => {
        const { icon, color } = (row.event && kindIcons[row.event.kind]) || { icon: "·", color: "var(--color-text-muted)" };
        return (
          <div key={row.event ? row.event.id : `redacted-${row.occurred_on}`} className="timeline-item" role="listitem">
            <div className="timeline-icon" style={{ color }} aria-hidden="true">
              {icon}
            </div>
            <div className="timeline-content">
              <p className="timeline-title">
                {row.url ? (
                  <a href={row.url} target="_blank" rel="noopener noreferrer">
                    {row.title}
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                ) : (
                  row.title
                )}
              </p>
              <p className="timeline-meta">
                {row.event && <span className="timeline-kind">{row.event.kind.replace(/_/g, " ")}</span>}
                <span className="timeline-time">{formatTime(row.occurred_at)}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
