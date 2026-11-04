import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConsentPanelComponent } from './components/consent-panel.component.js';
import { DemoHubComponent } from './components/demo-hub.component.js';
import { ExperienceStore } from './experience-store.js';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConsentPanelComponent, DemoHubComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isHome) {
      <app-demo-hub />
    }
    <router-outlet />
    <app-consent-panel />
  `,
})
export class AppComponent {
  // The Destination's home node is the only route whose slug is `/`. The hub
  // shows there, above the home Experience.
  protected readonly isHome = inject(ExperienceStore).data?.slug === '/';
}
