import type { Routes } from '@angular/router';

import { ExperiencePageComponent } from './pages/experience-page.component.js';
import { HomeComponent } from './pages/home.component.js';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: ':slug', component: ExperiencePageComponent },
];
