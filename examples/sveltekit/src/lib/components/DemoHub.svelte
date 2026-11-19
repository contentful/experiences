<script lang="ts">
  import { page } from '$app/state';

  const isOn = (name: string) => ['true', '1'].includes(page.url.searchParams.get(name) ?? '');
  const personalization = $derived(isOn('personalization'));
  const debug = $derived(isOn('debug'));

  // Carry the toggles onto the links.
  const withFlags = (href: string) => {
    const flags = new URLSearchParams();
    if (personalization) flags.set('personalization', 'true');
    if (debug) flags.set('debug', 'true');
    const query = flags.toString();
    return query ? `${href}?${query}` : href;
  };
</script>

<main
  style="max-width: 720px; margin: 40px auto; padding: 32px; background: #fff; border-radius: 16px; border: 1px solid #e5e7eb;"
>
  <h1 style="margin-top: 0;">Contentful Experiences — SvelteKit example</h1>
  <p style="color: #4b5563;">
    This app renders Contentful Experiences with <code>@contentful/experiences-svelte</code> in a
    SvelteKit server load. Pages are served from a <strong>Destination</strong>: the URL path is the
    Destination path. One Experience can also be fetched <strong>by id</strong>, which is the route
    for preview and live preview. The home Experience for this page is rendered
    below.
  </p>

  <form method="get" action="/">
    <p style="margin-bottom: 8px;">
      <label style="display: flex; align-items: center; gap: 8px; color: #374151;">
        <input type="checkbox" name="personalization" value="true" checked={personalization} />
        Personalization (simulates an EU visitor)
      </label>
    </p>
    <p style="margin-top: 0;">
      <label style="display: flex; align-items: center; gap: 8px; color: #374151;">
        <input type="checkbox" name="debug" value="true" checked={debug} />
        Debug output
      </label>
    </p>
    <button type="submit" style="padding: 6px 12px; cursor: pointer;">Apply</button>
  </form>

  <h2>Destination pages</h2>
  <ul>
    <li><a href={withFlags('/')}>/</a>: the home node (this page)</li>
    <li>
      <a href={withFlags('/demo/landing')}>/demo/landing</a>: the <code>landing</code> Experience
    </li>
    <li><a href="/welcome">/welcome</a>: a redirect node, sends you back to <code>/</code></li>
    <li>Any other path is a 404.</li>
  </ul>
  <p style="color: #4b5563;">
    Options: <code>?personalization=true</code>, <code>?debug=true</code>,
    <code>?locale=de-DE</code> (passed through to resolver metadata). Destinations do not support
    preview.
  </p>

  <h2>By Experience id</h2>
  <ul>
    <li>
      <a href={withFlags('/experiences/landing')}>/experiences/landing</a>: fetch the seeded
      <code>landing</code> Experience by id
    </li>
  </ul>
  <p style="color: #4b5563; margin-bottom: 4px;">
    Options on <code>/experiences/&lt;id&gt;</code>:
  </p>
  <ul style="color: #4b5563;">
    <li>
      <code>?personalization=true</code>, <code>?debug=true</code>, <code>?locale=de-DE</code>
    </li>
    <li>
      <code>?preview_session_id=&lt;id&gt;</code>: live preview. The Contentful app supplies the id
      (needs <code>CPA_TOKEN</code>)
    </li>
  </ul>
</main>
