import { useEffect, useReducer, useSyncExternalStore } from 'react';

import type { AttemptLog } from './attempt-log';

function timeAgo(observedAt: number) {
  const seconds = Math.floor((Date.now() - observedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}

export function TrackingLog({ log }: { log: AttemptLog }) {
  const { count, rows } = useSyncExternalStore(log.subscribe, log.getSnapshot, log.getSnapshot);
  const [, tick] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="tracking-log" data-testid="analytics-events-container">
      <div className="tracking-log__header">
        <h2>Tracking</h2>
        <span className="tracking-log__badge">
          <span data-testid="raw-events-count">{count}</span> attempts
        </span>
      </div>
      <p className="tracking-log__empty">
        SDK event notifications describe attempts before queue admission or delivery. Interaction
        notifications follow SDK consent policy and also require an available runtime profile or
        identity. Granting consent alone does not make interaction attempts appear for a fresh
        visitor. This reference does not initialize a visitor profile.
      </p>
      {!rows.length ? (
        <p className="tracking-log__empty" data-testid="no-events-message">
          No event attempts observed.
        </p>
      ) : (
        <table className="tracking-log__table">
          <thead className="tracking-log__thead">
            <tr>
              {['Type', 'Value', 'Dur', 'Age', 'Count'].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={`event-attempt-${row.id}`}>
                <td>
                  <span
                    className={`tracking-log__type${['view', 'hover', 'click', 'page'].includes(row.type) ? ` tracking-log__type--${row.type}` : ''}`}
                  >
                    {row.type}
                  </span>
                </td>
                <td className="tracking-log__label">{row.value}</td>
                <td className="tracking-log__duration">
                  {row.durationMs === undefined ? '' : `${(row.durationMs / 1000).toFixed(1)}s`}
                </td>
                <td className="tracking-log__time">{timeAgo(row.observedAt)}</td>
                <td className="tracking-log__count">{row.count > 1 ? `×${row.count}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
