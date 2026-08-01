import type { ExperimentEvent } from "../types/experiment";
import { formatEventType, formatLocalDateTime } from "../utils/format";

interface ExperimentEventTimelineProps {
  events: ExperimentEvent[];
}

export default function ExperimentEventTimeline({
  events,
}: ExperimentEventTimelineProps) {
  return (
    <section className="panel event-section" aria-labelledby="event-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Experiment log</p>
          <h2 id="event-heading">Events</h2>
        </div>
        <span className="count-badge">{events.length}</span>
      </div>

      {events.length === 0 ? (
        <div className="inline-empty" data-testid="no-events">
          <strong>No events recorded</strong>
          <p>Temperature readings are available, but no interventions or observations have been logged.</p>
        </div>
      ) : (
        <ol className="event-timeline">
          {events.map((event) => (
            <li key={event.id} data-testid="timeline-event">
              <div className="event-dot" aria-hidden="true" />
              <div className="event-card">
                <div className="event-meta">
                  <strong>{formatEventType(event.event_type)}</strong>
                  <time dateTime={event.occurred_at}>
                    {formatLocalDateTime(event.occurred_at)}
                  </time>
                </div>
                <p>{event.description}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
