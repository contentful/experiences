import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ConsentPanelComponent } from './components/consent-panel.component.js';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConsentPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-consent-panel />
  `,
})
export class AppComponent {}
