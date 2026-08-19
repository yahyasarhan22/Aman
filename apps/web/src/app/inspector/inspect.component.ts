import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { calculateScore, type ChecklistItemDef, type ItemResult } from '@aman/shared';
import {
  InspectorService,
  emptyAnswer,
  type DraftAnswer,
  type InspectionDraft,
} from '../core/inspector.service';
import { compressPhoto, objectUrl } from '../core/photo';
import { T } from '../core/strings';

const RESULTS: ItemResult[] = ['PASS', 'FAIL', 'NA'];

@Component({
  selector: 'app-inspect',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inspect.component.html',
  styleUrl: './inspect.component.css',
})
export class InspectComponent {
  readonly t = T;
  readonly results = RESULTS;

  readonly inspector = inject(InspectorService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly draft = signal<InspectionDraft | null>(null);
  readonly error = signal<string | null>(null);
  private readonly photoUrls = signal<Record<string, string>>({});

  readonly sections = computed(() => {
    const items = this.draft()?.bundle.items ?? [];
    return [...new Set(items.map((i) => i.section))].sort((a, b) => a - b);
  });

  readonly sectionIndex = computed(() => {
    const current = this.draft()?.currentSection;
    const index = this.sections().indexOf(current ?? -1);
    return index === -1 ? 0 : index;
  });

  readonly currentItems = computed(() => {
    const section = this.sections()[this.sectionIndex()];
    return (this.draft()?.bundle.items ?? []).filter((i) => i.section === section);
  });

  readonly currentSectionName = computed(() => this.currentItems()[0]?.sectionNameAr ?? '');

  readonly progress = computed(() => {
    const draft = this.draft();
    if (!draft) return 0;
    const items = draft.bundle.items;
    if (items.length === 0) return 0;
    const answered = items.filter((i) => draft.answers[i.id]?.result).length;
    return Math.round((answered / items.length) * 100);
  });

  /** Scores what has been answered so far — the same shared function the
   *  server will run on submit, so the number can never diverge. */
  readonly runningScore = computed(() => {
    const draft = this.draft();
    if (!draft) return null;
    const answered = draft.bundle.items
      .filter((i) => draft.answers[i.id]?.result)
      .map((i) => ({ severity: i.severity, result: draft.answers[i.id]!.result as ItemResult }));
    return answered.length ? calculateScore(answered) : null;
  });

  /**
   * Spec §5.5: a critical failure with no photo blocks progress, and so does an
   * unanswered item. The two are shown differently on purpose — a missing photo
   * is a rule the inspector has run into and needs explained, while an
   * unanswered item is simply work not done yet, and colouring that red would
   * cry wolf on every fresh section.
   */
  readonly photoBlocked = computed(() =>
    this.currentItems().some((item) => {
      const answer = this.draft()?.answers[item.id];
      return (
        item.severity === 'CRITICAL' && answer?.result === 'FAIL' && answer.photos.length === 0
      );
    }),
  );

  readonly incomplete = computed(() =>
    this.currentItems().some((item) => !this.draft()?.answers[item.id]?.result),
  );

  readonly blocked = computed(() => this.photoBlocked() || this.incomplete());

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    void this.load(id);
  }

  private async load(establishmentId: string): Promise<void> {
    try {
      const draft =
        (await this.inspector.getDraft(establishmentId)) ??
        (await this.inspector.startInspection(establishmentId));
      this.draft.set(draft);
      await this.hydratePhotos(draft);
    } catch {
      this.error.set(T.checklist.loadFailed);
    }
  }

  answer(itemId: string): DraftAnswer {
    return this.draft()?.answers[itemId] ?? emptyAnswer();
  }

  photoUrl(key: string): string {
    return this.photoUrls()[key] ?? '';
  }

  setResult(item: ChecklistItemDef, result: ItemResult): void {
    this.patch(item.id, (a) => ({ ...a, result }));
  }

  setMeasured(itemId: string, measuredValue: string): void {
    this.patch(itemId, (a) => ({ ...a, measuredValue }));
  }

  setNote(itemId: string, note: string): void {
    this.patch(itemId, (a) => ({ ...a, note }));
  }

  async addPhoto(itemId: string, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const blob = await compressPhoto(file);
    const key = await this.inspector.storePhoto(blob);
    this.photoUrls.update((urls) => ({ ...urls, [key]: objectUrl(blob) }));
    this.patch(itemId, (a) => ({ ...a, photos: [...a.photos, key] }));
  }

  removePhoto(itemId: string, key: string): void {
    this.patch(itemId, (a) => ({ ...a, photos: a.photos.filter((p) => p !== key) }));
    this.photoUrls.update((urls) => {
      const { [key]: removed, ...rest } = urls;
      if (removed) URL.revokeObjectURL(removed);
      return rest;
    });
  }

  goto(index: number): void {
    const section = this.sections()[index];
    if (section === undefined) return;
    this.update((draft) => ({ ...draft, currentSection: section }));
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  toReview(): void {
    const draft = this.draft();
    if (draft) void this.router.navigate(['/app/inspect', draft.establishmentId, 'review']);
  }

  async abandon(): Promise<void> {
    const draft = this.draft();
    if (!draft || !confirm(T.checklist.abandonConfirm)) return;
    await this.inspector.discardDraft(draft);
    await this.router.navigate(['/app/today']);
  }

  // Autosave on every single interaction — assume the phone dies at any
  // moment (spec §5.5).
  private patch(itemId: string, fn: (answer: DraftAnswer) => DraftAnswer): void {
    this.update((draft) => ({
      ...draft,
      answers: { ...draft.answers, [itemId]: fn(draft.answers[itemId] ?? emptyAnswer()) },
    }));
  }

  private update(fn: (draft: InspectionDraft) => InspectionDraft): void {
    const current = this.draft();
    if (!current) return;
    const next = fn(current);
    this.draft.set(next);
    void this.inspector.saveDraft(next);
  }

  private async hydratePhotos(draft: InspectionDraft): Promise<void> {
    const urls: Record<string, string> = {};
    for (const answer of Object.values(draft.answers)) {
      for (const key of answer.photos) {
        const blob = await this.inspector.getPhoto(key);
        if (blob) urls[key] = objectUrl(blob);
      }
    }
    this.photoUrls.set(urls);
  }
}
