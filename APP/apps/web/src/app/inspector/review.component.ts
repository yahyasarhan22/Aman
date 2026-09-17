import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  DEADLINE_DAYS,
  calculateScore,
  deadlineFor,
  renderRecommendation,
  scoreToGrade,
  type ChecklistItemDef,
  type Grade,
  type ItemResult,
} from '@aman/shared';
import { GradeBadgeComponent } from '../ui/grade-badge.component';
import { SignaturePadComponent } from './signature-pad.component';
import {
  InspectorService,
  emptyAnswer,
  type DraftAnswer,
  type InspectionDraft,
  type SubmitResult,
} from '../core/inspector.service';
import { objectUrl } from '../core/photo';
import { T } from '../core/strings';

interface Failure {
  item: ChecklistItemDef;
  answer: DraftAnswer;
  deadline: Date;
}

@Component({
  selector: 'app-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, GradeBadgeComponent, SignaturePadComponent],
  templateUrl: './review.component.html',
  styleUrl: './review.component.css',
})
export class ReviewComponent {
  readonly t = T;

  private inspector = inject(InspectorService);
  private route = inject(ActivatedRoute);

  readonly draft = signal<InspectionDraft | null>(null);
  readonly busy = signal(false);
  readonly queued = signal(false);
  readonly submitted = signal<SubmitResult | null>(null);
  readonly error = signal<string | null>(null);
  private readonly photoUrls = signal<Record<string, string>>({});

  readonly establishmentSlug = computed(() => this.draft()?.bundle.establishment.slug ?? '');

  readonly failures = computed<Failure[]>(() => {
    const draft = this.draft();
    if (!draft) return [];
    const now = new Date();
    return draft.bundle.items
      .filter((item) => draft.answers[item.id]?.result === 'FAIL')
      .map((item) => ({
        item,
        answer: draft.answers[item.id] ?? emptyAnswer(),
        deadline: deadlineFor(item.severity, now),
      }));
  });

  readonly score = computed(() => {
    const draft = this.draft();
    if (!draft) return null;
    return calculateScore(
      draft.bundle.items
        .filter((i) => draft.answers[i.id]?.result)
        .map((i) => ({ severity: i.severity, result: draft.answers[i.id]!.result as ItemResult })),
    );
  });

  readonly grade = computed<Grade | null>(() => {
    const score = this.score();
    return score === null ? null : scoreToGrade(score);
  });

  readonly canSubmit = computed(
    () => !this.busy() && this.draft() !== null && this.draft()!.signature !== null,
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    void this.load(id);
  }

  private async load(establishmentId: string): Promise<void> {
    const draft = await this.inspector.getDraft(establishmentId);
    if (!draft) {
      this.error.set(T.checklist.loadFailed);
      return;
    }
    // Pre-fill each recommendation from its template (spec §6.5); the inspector
    // edits the text, and what they approve is what gets stored.
    const recommendations = { ...draft.recommendations };
    for (const item of draft.bundle.items) {
      if (draft.answers[item.id]?.result !== 'FAIL' || recommendations[item.id]) continue;
      recommendations[item.id] = renderRecommendation(item.recommendationTemplate, {
        measured: draft.answers[item.id]?.measuredValue,
        threshold: item.threshold,
        deadline: DEADLINE_DAYS[item.severity],
      });
    }
    this.draft.set({ ...draft, recommendations });
    await this.hydratePhotos(draft);
  }

  recommendation(itemId: string): string {
    return this.draft()?.recommendations[itemId] ?? '';
  }

  setRecommendation(itemId: string, text: string): void {
    this.update((draft) => ({
      ...draft,
      recommendations: { ...draft.recommendations, [itemId]: text },
    }));
  }

  setSignature(signature: string | null): void {
    this.update((draft) => ({ ...draft, signature }));
  }

  photoUrl(key: string): string {
    return this.photoUrls()[key] ?? '';
  }

  async submit(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    if (!confirm(`${T.review.confirmTitle}\n\n${T.review.confirmBody}`)) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const { result, queued } = await this.inspector.submit(draft);
      this.queued.set(queued);
      this.submitted.set(result);
    } finally {
      this.busy.set(false);
    }
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
