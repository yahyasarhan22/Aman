import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AppBarComponent } from './app-bar.component';
import { GradeBadgeComponent } from '../ui/grade-badge.component';
import { InspectorService, type InspectionDetail, type InspectionDetailItem } from '../core/inspector.service';
import { API_BASE } from '../core/api';
import { T } from '../core/strings';

@Component({
  selector: 'app-inspection-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, AppBarComponent, GradeBadgeComponent],
  template: `
    <app-bar [title]="t.inspectionDetail.title" [subtitle]="detail()?.establishmentNameAr ?? ''" />

    <main class="page">
      @if (error()) {
        <p class="notice" role="alert">{{ error() }}</p>
      } @else if (detail(); as d) {
        <section class="outcome">
          <div class="outcome__grades">
            <app-grade-badge [grade]="d.previousGrade" variant="chip" />
            <span class="outcome__arrow" aria-hidden="true">←</span>
            <app-grade-badge [grade]="d.grade" variant="chip" />
          </div>
          <p class="outcome__meta">
            {{ t.inspectionDetail.submittedAt }}:
            <span class="ltr">{{ d.submittedAt | date: 'yyyy-MM-dd HH:mm' }}</span>
          </p>
          <p class="outcome__score">
            {{ t.publicPage.score }}: <span class="ltr">{{ d.score }}/100</span>
          </p>
        </section>

        <section class="block">
          <h2 class="eyebrow">{{ t.review.failedTitle }}</h2>
          @if (d.violations.length === 0) {
            <p class="muted">{{ t.review.noFailures }}</p>
          } @else {
            <ul class="violations">
              @for (v of d.violations; track v.id) {
                <li class="violation" [class]="'violation--' + v.severity">
                  <div class="violation__head">
                    <span class="sev" [class]="'sev--' + v.severity">
                      {{ t.checklist.severity[v.severity] }}
                    </span>
                    <span class="violation__status">{{ t.inspectionDetail.violationStatus[v.status] }}</span>
                    @if (v.deadlineAt) {
                      <span class="violation__deadline">
                        {{ t.review.deadline }}: <span class="ltr">{{ v.deadlineAt | date: 'yyyy-MM-dd' }}</span>
                      </span>
                    }
                  </div>
                  <p class="violation__label">{{ v.category }}</p>
                  @if (v.recommendation) {
                    <p class="violation__rec">{{ v.recommendation }}</p>
                  }
                </li>
              }
            </ul>
          }
        </section>

        <section class="block">
          <h2 class="eyebrow">{{ t.inspectionDetail.checklistTitle }}</h2>
          @for (section of sections(); track section.name) {
            <div class="section">
              <h3 class="section__name">{{ section.name }}</h3>
              <ul class="items">
                @for (item of section.items; track item.checklistItemId) {
                  <li class="item">
                    <div class="item__head">
                      <span class="ltr item__code">{{ item.code }}</span>
                      <span class="res" [class]="'res--' + item.result">
                        {{ t.checklist.result[item.result] }}
                      </span>
                    </div>
                    <p class="item__label">{{ item.labelAr }}</p>
                    @if (item.measuredValue) {
                      <p class="item__measured">
                        {{ t.checklist.measured }}:
                        <span class="ltr">{{ item.measuredValue }}{{ item.unit }}</span>
                      </p>
                    }
                    @if (item.note) {
                      <p class="item__note">{{ item.note }}</p>
                    }
                    @if (item.photoIds.length) {
                      <div class="item__photos">
                        @for (id of item.photoIds; track id) {
                          <img [src]="photoUrl(id)" [alt]="t.checklist.photoAttached + ' — ' + item.labelAr" />
                        }
                      </div>
                    }
                  </li>
                }
              </ul>
            </div>
          }
        </section>

        <a class="btn btn--ghost btn--block" routerLink="/app/today">{{ t.inspectionDetail.back }}</a>
      } @else {
        <p class="muted">{{ t.common.loading }}</p>
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-block-size: 100dvh;
        background: var(--paper);
      }

      .page {
        max-inline-size: 560px;
        margin-inline: auto;
        padding: var(--s4) var(--s4) var(--s7);
        display: flex;
        flex-direction: column;
        gap: var(--s4);
      }

      .muted {
        color: var(--ink-muted);
        font-size: var(--text-caption);
      }

      .outcome {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius-lg);
        padding: var(--s4);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      .outcome__grades {
        display: flex;
        align-items: center;
        gap: var(--s3);
      }

      .outcome__arrow {
        color: var(--ink-muted);
      }

      .outcome__meta,
      .outcome__score {
        font-size: 13px;
        color: var(--ink-muted);
      }

      .block {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }

      .eyebrow {
        font-size: 13px;
        font-weight: 700;
        color: var(--ink-muted);
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .violations {
        display: flex;
        flex-direction: column;
        gap: var(--s3);
      }

      .violation {
        background: var(--card);
        border: 1px solid var(--rule);
        border-inline-start: 4px solid var(--rule-strong);
        border-radius: var(--radius);
        padding: var(--s3);
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      .violation--CRITICAL {
        border-inline-start-color: var(--risk-high, #c0392b);
      }

      .violation--MAJOR {
        border-inline-start-color: var(--risk-mid, #d68910);
      }

      .violation__head {
        display: flex;
        align-items: center;
        gap: var(--s3);
        font-size: 13px;
        color: var(--ink-muted);
      }

      .sev {
        font-weight: 700;
      }

      .violation__status {
        padding-inline: var(--s2);
        border-radius: var(--radius);
        background: var(--paper);
      }

      .violation__label {
        font-size: var(--text-caption);
        color: var(--ink);
      }

      .violation__rec {
        font-size: 13px;
        color: var(--ink-2);
      }

      .section {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      .section__name {
        font-size: var(--text-caption);
        font-weight: 700;
        color: var(--ink);
      }

      .items {
        display: flex;
        flex-direction: column;
        gap: var(--s2);
      }

      .item {
        background: var(--card);
        border: 1px solid var(--rule);
        border-radius: var(--radius);
        padding: var(--s3);
        display: flex;
        flex-direction: column;
        gap: var(--s1);
      }

      .item__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .item__code {
        font-size: 12px;
        color: var(--ink-muted);
      }

      .res {
        font-size: 12px;
        font-weight: 700;
        padding-inline: var(--s2);
        border-radius: var(--radius);
      }

      .res--PASS {
        color: var(--ok, #1a7a3c);
      }

      .res--FAIL {
        color: var(--risk-high, #c0392b);
      }

      .res--NA {
        color: var(--ink-muted);
      }

      .item__label {
        font-size: var(--text-caption);
        color: var(--ink);
      }

      .item__measured,
      .item__note {
        font-size: 13px;
        color: var(--ink-2);
      }

      .item__photos {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s2);
      }

      .item__photos img {
        inline-size: 72px;
        block-size: 72px;
        object-fit: cover;
        border-radius: var(--radius);
        border: 1px solid var(--rule);
      }
    `,
  ],
})
export class InspectionDetailComponent {
  readonly t = T;

  private route = inject(ActivatedRoute);
  private inspector = inject(InspectorService);

  readonly detail = signal<InspectionDetail | null>(null);
  readonly error = signal<string | null>(null);

  /** Grouped in checklist order — items already arrive sorted by sortOrder. */
  readonly sections = computed(() => {
    const items = this.detail()?.items ?? [];
    const groups: { name: string; items: InspectionDetailItem[] }[] = [];
    for (const item of items) {
      const last = groups[groups.length - 1];
      if (last?.name === item.sectionNameAr) last.items.push(item);
      else groups.push({ name: item.sectionNameAr, items: [item] });
    }
    return groups;
  });

  photoUrl(id: string): string {
    return `${API_BASE}/uploads/${id}`;
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    void this.load(id);
  }

  private async load(id: string): Promise<void> {
    try {
      this.detail.set(await this.inspector.getInspectionDetail(id));
    } catch {
      this.error.set(T.inspectionDetail.loadFailed);
    }
  }
}
