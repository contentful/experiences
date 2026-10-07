import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main
      style="max-width: 720px; margin: 40px auto; padding: 32px; background: #fff; border-radius: 16px; border: 1px solid #e5e7eb;"
    >
      <h1 style="margin-top: 0;">Contentful Experiences — Angular example</h1>
      <p style="color: #4b5563;">
        This app demonstrates rendering a Contentful Experience payload with
        <code>&#64;contentful/experiences-angular</code> from an
        <code>&#64;angular/ssr</code> server.
      </p>
      <form action="/landing" method="get">
        <p>
          <label style="display: flex; align-items: center; gap: 8px; color: #374151;">
            <input type="checkbox" name="personalization" value="true" />
            Personalization (send a page event as an EU visitor)
          </label>
        </p>
        <button
          type="submit"
          style="padding: 10px 16px; border: 0; border-radius: 8px; background: #4f39f6; color: #ffffff; font-size: 16px; font-weight: 500; cursor: pointer;"
        >
          View the demo experience
        </button>
      </form>
      <p style="color: #9ca3af; font-size: 13px; margin-top: 24px; margin-bottom: 0;">
        <code>landing</code> is the id the bootstrap script (<code>examples/scripts</code>) seeds by
        default. Replace it in the URL with any other Experience id from your space. Append
        <code>?preview=true</code> to read from the preview API (requires <code>CPA_TOKEN</code>),
        or <code>?debug=true</code> to print the resolved plan above the experience.
      </p>
    </main>
  `,
})
export class HomeComponent {}
