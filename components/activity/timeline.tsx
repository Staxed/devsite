import type { ActivityEvent } from "@/lib/supabase/types";

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

function getDisplayTitle(event: ActivityEvent): string {
  if (event.visibility === "private" && event.repo_visibility === "private") {
    return event.public_summary || "Activity in a private repository";
  }
  return event.title || event.public_summary || event.kind;
}

export default function Timeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="timeline-empty">
        <p>No activity yet. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="timeline" role="list" aria-label="Activity timeline">
      {events.map((event) => {
        const { icon, color } = kindIcons[event.kind] || { icon: "·", color: "var(--color-text-muted)" };
        return (
          <div key={event.id} className="timeline-item" role="listitem">
            <div className="timeline-icon" style={{ color }} aria-hidden="true">
              {icon}
            </div>
            <div className="timeline-content">
              <p className="timeline-title">
                {event.url && event.visibility === "public" ? (
                  <a href={event.url} target="_blank" rel="noopener noreferrer">
                    {getDisplayTitle(event)}
                    <span className="sr-only"> (opens in new tab)</span>
                  </a>
                ) : (
                  getDisplayTitle(event)
                )}
              </p>
              <p className="timeline-meta">
                <span className="timeline-kind">{event.kind.replace(/_/g, " ")}</span>
                <span className="timeline-time">{formatTime(event.occurred_at)}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
