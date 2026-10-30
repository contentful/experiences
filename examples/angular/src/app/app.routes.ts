import type { Routes } from '@angular/router';

import { ExperiencePageComponent } from './pages/experience-page.component.js';

// Both routes render the plan `src/server.ts` resolved for the request: the
// Express layer sends `/experiences/:id` to a by-id fetch and every other path
// to a Destination fetch. The router only chooses the component.
export const routes: Routes = [
  { path: 'experiences/:id', component: ExperiencePageComponent },
  { path: '**', component: ExperiencePageComponent },
];
