import { cloneTemplate } from './templates.js';

// Maintainer: this entire module is optional event-attempt diagnostics. Its rows,
// counter, grouping and age timer do not submit events or measure interactions;
// SDK interaction tracking/event calls work without this sidebar subscription.
function timeAgo(startMs) {
  const seconds = Math.floor((Date.now() - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}

function badgeType(event) {
  if (event.type === 'exo_node_view') return 'view';
  if (event.type === 'exo_node_click') return 'click';
  if (event.type === 'exo_node_hover') return 'hover';
  return event.type;
}

function pagePath(event) {
  if (event.type !== 'page' || !event.properties?.url) return undefined;
  try {
    return new URL(event.properties.url, window.location.origin).pathname;
  } catch {
    return String(event.properties.url);
  }
}

function eventValue(event) {
  if (event.entityId) return `${event.entityKind}: ${event.entityId}`;
  if (event.type === 'identify') return event.userId ?? event.type;
  if (event.type === 'track') return event.event ?? event.type;
  return pagePath(event) ?? event.componentId ?? event.type;
}

function updateDuration(row, event) {
  for (const name of ['hoverDurationMs', 'viewDurationMs']) {
    if (event[name] !== undefined) row.dataset[name] = String(event[name]);
  }
  const duration = event.hoverDurationMs ?? event.viewDurationMs;
  row.cells[2].textContent = duration === undefined ? '' : `${(duration / 1000).toFixed(1)}s`;
}

export function createTrackingLog(sdk) {
  const rawEventsCountEl = document.getElementById('raw-events-count');
  const noEventsMessage = document.getElementById('no-events-message');
  const trackingTable = document.getElementById('tracking-table');
  const trackingTbody = document.getElementById('tracking-tbody');
  let rawEventCount = 0;
  const intervalRows = new Map();

  function createRow(event, interval) {
    const row = cloneTemplate('event-row').firstElementChild;
    // Maintainer: selectors expose real interval/entity metadata for inspection.
    // A reused XDA identify message is still a separate observed attempt.
    row.dataset.testid = `event-${event.type}-${event.messageId ?? 'attempt'}-${rawEventCount}`;
    const id = event[`${interval}Id`];
    if (interval && typeof id === 'string') {
      row.dataset.testid =
        interval === 'view' ? `event-view-${id}` : `event-${event.type}-hover-${id}`;
      row.dataset[`${interval}Id`] = id;
    }
    if (event.entityId) row.dataset.entityId = event.entityId;
    if (event.entityKind) row.dataset.entityKind = event.entityKind;
    const path = pagePath(event);
    if (path !== undefined) row.dataset.pageUrl = path;
    row.dataset.observedAt = String(Date.now());

    const badge = row.querySelector('span');
    const type = badgeType(event);
    if (['page', 'view', 'click', 'hover'].includes(type)) {
      badge.classList.add(`tracking-log__type--${type}`);
    }
    badge.textContent = type;
    row.cells[1].textContent = eventValue(event);
    return row;
  }

  function onEvent(event) {
    // Reset clears the observable; retain the reference's displayed history.
    if (event === undefined) return;
    rawEventCount += 1;
    try {
      // Publication records an attempt, before transport or queue admission.
      rawEventsCountEl.textContent = String(rawEventCount);
      noEventsMessage.style.display = 'none';
      trackingTable.style.display = '';

      // Maintainer: group duration updates only by their actual interval IDs.
      // This is a display rule, not transport deduplication or delivery evidence.
      const interval =
        event.type === 'exo_node_view'
          ? 'view'
          : event.type === 'exo_node_hover'
            ? 'hover'
            : undefined;
      const id = event[`${interval}Id`];
      const key =
        interval && typeof id === 'string' && typeof event[`${interval}DurationMs`] === 'number'
          ? `${interval}:${id}`
          : undefined;
      let row = intervalRows.get(key);
      if (!row) {
        row = createRow(event, interval);
        trackingTbody.prepend(row);
        if (key !== undefined) intervalRows.set(key, row);
      }
      updateDuration(row, event);
    } catch {
      // A sidebar failure must never interrupt the SDK's event submission.
      window.console.error('Unable to render the tracking event attempt.');
    }
  }

  // Consumer integration, if observing events: unsubscribe when the observer is no longer
  // needed. Publication means an attempt, even before queue admission is known.
  const subscription = sdk.states.eventStream.subscribe(onEvent);
  const ageTimer = window.setInterval(() => {
    for (const row of trackingTbody.rows) {
      row.cells[3].textContent = timeAgo(Number(row.dataset.observedAt));
    }
  }, 1000);

  return {
    dispose() {
      subscription.unsubscribe();
      window.clearInterval(ageTimer);
    },
  };
}
