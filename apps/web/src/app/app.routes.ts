import { Routes } from '@angular/router';
import { EstablishmentComponent } from './establishment/establishment.component';

export const routes: Routes = [
  { path: 'e/:slug', component: EstablishmentComponent },
];
