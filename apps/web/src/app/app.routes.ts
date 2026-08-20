import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './core/api';
import { HomeComponent } from './public/home.component';
import { EstablishmentComponent } from './public/establishment.component';
import { ComplaintFormComponent } from './public/complaint-form.component';
import { ComplaintTrackComponent } from './public/complaint-track.component';
import { LoginComponent } from './inspector/login.component';
import { TodayComponent } from './inspector/today.component';
import { InspectComponent } from './inspector/inspect.component';
import { ReviewComponent } from './inspector/review.component';
import { SyncComponent } from './inspector/sync.component';
import { AdminShellComponent } from './admin/admin-shell.component';
import { AdminDashboardComponent } from './admin/dashboard.component';
import { AdminComplaintsComponent } from './admin/complaints.component';
import { AdminPlanningComponent } from './admin/planning.component';
import { AdminSettingsComponent } from './admin/settings.component';
import { AdminQrSheetComponent } from './admin/qr-sheet.component';
import { OwnerPortalComponent } from './owner/portal.component';

const signedIn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isSignedIn() ? true : router.createUrlTree(['/app/login']);
};

/** A signed-in inspector who lands here is not an error to shout about —
 *  send them to the screen they do have. The API enforces the real boundary. */
const isAdmin = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isSignedIn()) return router.createUrlTree(['/app/login']);
  return auth.user()?.role === 'ADMIN' ? true : router.createUrlTree(['/app/today']);
};

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'e/:slug', component: EstablishmentComponent },
  { path: 'e/:slug/complaint', component: ComplaintFormComponent },
  // 'track' before ':ref', otherwise the literal is captured as a reference.
  { path: 'complaint/track', component: ComplaintTrackComponent },
  { path: 'complaint/:ref', component: ComplaintTrackComponent },

  { path: 'app/login', component: LoginComponent },
  { path: 'app/today', component: TodayComponent, canActivate: [signedIn] },
  { path: 'app/inspect/:id', component: InspectComponent, canActivate: [signedIn] },
  { path: 'app/inspect/:id/review', component: ReviewComponent, canActivate: [signedIn] },
  { path: 'app/sync', component: SyncComponent, canActivate: [signedIn] },

  { path: 'portal', component: OwnerPortalComponent, canActivate: [signedIn] },

  {
    path: 'admin',
    component: AdminShellComponent,
    canActivate: [isAdmin],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'complaints', component: AdminComplaintsComponent },
      { path: 'planning', component: AdminPlanningComponent },
      { path: 'settings', component: AdminSettingsComponent },
      { path: 'qr', component: AdminQrSheetComponent },
    ],
  },

  { path: '**', redirectTo: '' },
];
