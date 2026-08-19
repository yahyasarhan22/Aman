import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './core/api';
import { HomeComponent } from './public/home.component';
import { EstablishmentComponent } from './public/establishment.component';
import { LoginComponent } from './inspector/login.component';
import { TodayComponent } from './inspector/today.component';
import { InspectComponent } from './inspector/inspect.component';
import { ReviewComponent } from './inspector/review.component';
import { SyncComponent } from './inspector/sync.component';

const signedIn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isSignedIn() ? true : router.createUrlTree(['/app/login']);
};

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'e/:slug', component: EstablishmentComponent },

  { path: 'app/login', component: LoginComponent },
  { path: 'app/today', component: TodayComponent, canActivate: [signedIn] },
  { path: 'app/inspect/:id', component: InspectComponent, canActivate: [signedIn] },
  { path: 'app/inspect/:id/review', component: ReviewComponent, canActivate: [signedIn] },
  { path: 'app/sync', component: SyncComponent, canActivate: [signedIn] },

  { path: '**', redirectTo: '' },
];
