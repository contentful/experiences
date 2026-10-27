import { useState } from 'react';

/** Host-owned component, not authored in Contentful. Inserted by ExperienceNodes.astro. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  return (
    <aside
      data-chat-widget
      style={{ padding: '1rem', border: '1px solid #4f39f6', borderRadius: '0.5rem' }}
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Close chat' : 'Questions? Chat with us'}
      </button>
      {open && <p style={{ margin: '0.75rem 0 0' }}>Hi! How can we help?</p>}
    </aside>
  );
}
