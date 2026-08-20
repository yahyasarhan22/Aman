import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  COMPLAINT_CATEGORIES,
  ComplaintService,
  type ComplaintCategory,
} from './complaint.service';
import { EstablishmentService } from './establishment.service';
import { compressPhoto, objectUrl } from '../core/photo';
import { T } from '../core/strings';

@Component({
  selector: 'app-complaint-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './complaint-form.component.html',
  styleUrl: './complaint-form.component.css',
})
export class ComplaintFormComponent {
  readonly t = T;
  readonly categories = COMPLAINT_CATEGORIES;

  private route = inject(ActivatedRoute);
  private complaints = inject(ComplaintService);
  private establishments = inject(EstablishmentService);

  readonly slug = signal(this.route.snapshot.paramMap.get('slug') ?? '');
  readonly establishmentNameAr = signal('');

  readonly category = signal<ComplaintCategory | null>(null);
  readonly description = signal('');
  readonly phone = signal('');
  readonly honeypot = signal('');

  readonly photoUrl = signal<string | null>(null);
  private photoBlob: Blob | null = null;

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly reference = signal<string | null>(null);
  readonly copied = signal(false);

  readonly canSubmit = computed(
    () => this.category() !== null && this.description().trim().length > 0,
  );

  constructor() {
    this.establishments.getBySlug(this.slug()).subscribe({
      next: (e) => this.establishmentNameAr.set(e.nameAr),
      error: () => this.establishmentNameAr.set(''),
    });
  }

  async addPhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    // Re-encoding through a canvas compresses and discards EXIF before the
    // photo ever leaves the citizen's phone. The server strips again.
    this.photoBlob = await compressPhoto(file);
    this.photoUrl.set(objectUrl(this.photoBlob));
  }

  removePhoto(): void {
    const url = this.photoUrl();
    if (url) URL.revokeObjectURL(url);
    this.photoBlob = null;
    this.photoUrl.set(null);
  }

  async copyReference(reference: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(reference);
      this.copied.set(true);
    } catch {
      // Clipboard access can be denied over plain HTTP or without a gesture.
      // The number is displayed large on screen regardless, so this is not
      // worth an error message.
    }
  }

  /**
   * Bound to the native submit event, not ngSubmit: this component holds its
   * state in signals and never touches ngModel, so pulling in FormsModule just
   * to get NgForm would be dead weight. Without NgForm, (ngSubmit) silently
   * never fires and the browser performs a real GET navigation instead.
   */
  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const photoIds: string[] = [];
      if (this.photoBlob) photoIds.push(await this.complaints.uploadPhoto(this.photoBlob));

      const result = await this.complaints.submit({
        slug: this.slug(),
        category: this.category()!,
        description: this.description().trim(),
        photoIds,
        contactPhone: this.phone().trim() || null,
        honeypot: this.honeypot(),
      });
      this.reference.set(result.reference);
    } catch (error) {
      const message = (error as { error?: { message?: string } })?.error?.message;
      this.error.set(message ?? T.complaint.failed);
    } finally {
      this.busy.set(false);
    }
  }
}
