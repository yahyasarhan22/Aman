import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { Grade } from '@aman/shared';
import { GradeBadgeComponent } from '../ui/grade-badge.component';
import { AuthService } from '../core/api';
import { compressPhoto, objectUrl } from '../core/photo';
import { OwnerApiService, type OwnerOverview, type OwnerViolation } from './owner.service';
import { T } from '../core/strings';

/**
 * Spec §5.7: turn a punishment into a to-do list. If owners experience this as
 * helpful, adoption stops being a fight — so every open item leads with what
 * to actually do, not with what was found wrong.
 */
@Component({
  selector: 'app-owner-portal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, GradeBadgeComponent],
  templateUrl: './portal.component.html',
  styleUrl: './portal.component.css',
})
export class OwnerPortalComponent {
  readonly t = T;
  readonly auth = inject(AuthService);
  private api = inject(OwnerApiService);

  readonly overview = signal<OwnerOverview | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  private notes = signal<Record<string, string>>({});
  private photos = signal<Record<string, { blob: Blob; url: string }[]>>({});

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.overview.set(await this.api.overview());
    } catch {
      this.error.set(T.owner.loadFailed);
    }
  }

  asGrade(grade: string | null): Grade | null {
    return (grade as Grade) ?? null;
  }

  isAwaiting(v: OwnerViolation): boolean {
    return v.status === 'OWNER_RESPONDED';
  }

  noteFor(id: string): string {
    return this.notes()[id] ?? '';
  }

  setNote(id: string, value: string): void {
    this.notes.update((all) => ({ ...all, [id]: value }));
  }

  photoUrlsFor(id: string): string[] {
    return (this.photos()[id] ?? []).map((p) => p.url);
  }

  async addPhoto(id: string, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const blob = await compressPhoto(file);
    this.photos.update((all) => ({
      ...all,
      [id]: [...(all[id] ?? []), { blob, url: objectUrl(blob) }],
    }));
  }

  async submit(event: Event, id: string): Promise<void> {
    event.preventDefault();
    this.busy.set(id);
    this.error.set(null);
    try {
      const photoIds: string[] = [];
      for (const photo of this.photos()[id] ?? []) {
        photoIds.push(await this.api.uploadPhoto(photo.blob));
      }
      await this.api.respond(id, this.noteFor(id), photoIds);
      await this.load();
    } catch {
      this.error.set(T.owner.failed);
    } finally {
      this.busy.set(null);
    }
  }
}
