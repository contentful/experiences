import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ServerExperienceRendererComponent } from '@contentful/experiences-angular';

import { ExperienceStore } from '../experience-store.js';
import { experienceConfig } from '../lib/experience-config.js';

/**
 * Renders the plan the Express layer already resolved.
 *
 * `[metadata]` and `[debug]` are optional — the plan already carries what
 * `fetchExperience` was given. They are bound here to show the render-time
 * override: `metadata` merges over the plan's, `debug` replaces it. `[config]`
 * is not optional; component classes cannot survive `TransferState`.
 *
 * `<cf-server-experience>` resolves the active viewport once and never
 * reconsiders — swap it for `<cf-experience>` (`ClientExperienceRendererComponent`)
 * if you want design values to follow live `matchMedia` changes on resize.
 */
@Component({
  selector: 'app-experience-page',
  imports: [ServerExperienceRendererComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (experience; as plan) {
      <cf-server-experience
        [experience]="plan"
        [config]="config"
        [metadata]="renderMetadata"
        [debug]="debug"
      />
    } @else {
      <main
        style="max-width: 720px; margin: 40px auto; padding: 32px; background: #fff; border-radius: 16px; border: 1px solid #e5e7eb;"
      >
        <h1 style="margin-top: 0;">Experience not found</h1>
        <p style="color: #4b5563;">
          Nothing was returned for <code>{{ slug }}</code
          >. Seed the demo Experience with <code>examples/scripts</code> (<code
            >npm run bootstrap</code
          >), or check that <code>SPACE_ID</code>, <code>ENVIRONMENT_ID</code>, and
          <code>CDA_TOKEN</code> point at a space that has it.
        </p>
      </main>
    }
  `,
})
export class ExperiencePageComponent {
  private readonly data = inject(ExperienceStore).data;

  protected readonly config = experienceConfig;
  protected readonly experience = this.data?.experience ?? null;
  protected readonly slug = this.data?.slug ?? '';
  protected readonly debug = this.data?.debug ?? false;
  protected readonly renderMetadata = { renderer: 'server' };
}
