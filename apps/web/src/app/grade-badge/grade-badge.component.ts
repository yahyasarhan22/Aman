import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Grade } from '@aman/shared';

const GRADE_COLORS: Record<string, string> = {
  A: '#1e8449',
  B: '#b7950b',
  C: '#ca6f1e',
  D: '#a93226',
};

@Component({
  selector: 'app-grade-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="seal"
      [style.--seal-color]="color"
      [attr.aria-label]="grade ? 'الدرجة: ' + grade : 'لم يتم التفتيش بعد'"
    >
      <div class="seal__ring">
        <span class="seal__letter">{{ grade ?? '—' }}</span>
      </div>
    </div>
  `,
  styles: [
    `:host {
      display: block;
    }
    .seal {
      width: 128px;
      height: 128px;
      margin: 0 auto;
      border-radius: 50%;
      background: var(--seal-color);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px -8px color-mix(in srgb, var(--seal-color) 55%, transparent);
    }
    .seal__ring {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.55);
      outline: 1px solid rgba(255, 255, 255, 0.28);
      outline-offset: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .seal__letter {
      color: #fff;
      font-size: 44px;
      font-weight: 700;
      line-height: 1;
    }`,
  ],
})
export class GradeBadgeComponent {
  @Input() grade: Grade | null = null;

  get color(): string {
    return this.grade ? GRADE_COLORS[this.grade] : '#9e9e9e';
  }
}
