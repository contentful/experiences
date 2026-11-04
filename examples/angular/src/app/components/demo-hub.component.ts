import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

const isOn = (value: unknown) => ['true', '1'].includes(String(value ?? ''));

/**
 * The demo hub shown at `/`, above the Destination's home node. Plain anchors
 * and a GET form on purpose: every route needs a server fetch, so these are
 * full page loads rather than client-side navigation.
 */
@Component({
  selector: 'app-demo-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      style="max-width: 720px; margin: 40px auto; padding: 32px; background: #fff; border-radius: 16px; border: 1px solid #e5e7eb;"
    >
      <h1 style="margin-top: 0;">Contentful Experiences — Angular example</h1>
      <p style="color: #4b5563;">
        This app renders Contentful Experiences with <code>&#64;contentful/experiences-angular</code> in
        Angular SSR. Pages are served from a <strong>Destination</strong>: the URL path is the
        Destination path. One Experience can also be fetched <strong>by id</strong>, which is the
        route for preview and live preview. The home Experience for this page is rendered below.
      </p>

      <form method="get" action="/">
        <p style="margin-bottom: 8px;">
          <label style="display: flex; align-items: center; gap: 8px; color: #374151;">
            <input type="checkbox" name="personalization" value="true" [checked]="personalization" />
            Personalization (simulates an EU visitor)
          </label>
        </p>
        <p style="margin-top: 0;">
          <label style="display: flex; align-items: center; gap: 8px; color: #374151;">
            <input type="checkbox" name="debug" value="true" [checked]="debug" />
            Debug output
          </label>
        </p>
        <button type="submit" style="padding: 6px 12px; cursor: pointer;">Apply</button>
      </form>

      <h2>Destination pages</h2>
      <ul>
        <li><a [href]="withFlags('/')">/</a>: the home node (this page)</li>
        <li>
          <a [href]="withFlags('/demo/landing')">/demo/landing</a>: the <code>landing</code>
          Experience
        </li>
        <li>
          <a href="/welcome">/welcome</a>: a redirect node, sends you back to <code>/</code>
        </li>
        <li>Any other path is a 404.</li>
      </ul>
      <p style="color: #4b5563;">
        Options: <code>?personalization=true</code>, <code>?debug=true</code>,
        <code>?locale=de-DE</code> (passed through to resolver metadata). Destinations do not
        support preview.
      </p>

      <h2>By Experience id</h2>
      <ul>
        <li>
          <a [href]="withFlags('/experiences/landing')">/experiences/landing</a>: fetch the seeded
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
          <code>?preview=true</code>: read from the Preview API (needs <code>CPA_TOKEN</code>)
        </li>
        <li>
          <code>?preview_session_id=&lt;id&gt;</code>: live preview. The Contentful app supplies the
          id (needs <code>CPA_TOKEN</code>)
        </li>
      </ul>
    </main>
  `,
})
export class DemoHubComponent {
  private readonly router = inject(Router);
  private readonly query = this.router.parseUrl(this.router.url).queryParams;

  protected readonly personalization = isOn(this.query['personalization']);
  protected readonly debug = isOn(this.query['debug']);

  /** Carry the toggles onto the links. */
  protected withFlags(href: string): string {
    const flags = new URLSearchParams();
    if (this.personalization) flags.set('personalization', 'true');
    if (this.debug) flags.set('debug', 'true');
    const query = flags.toString();
    return query ? `${href}?${query}` : href;
  }
}
