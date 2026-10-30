import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConsentPanelComponent } from './components/consent-panel.component.js';
import { PersonalizationToggleComponent } from './components/personalization-toggle.component.js';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConsentPanelComponent, PersonalizationToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-personalization-toggle />
    <router-outlet />
    <app-consent-panel />
  `,
})
export class AppComponent {}
