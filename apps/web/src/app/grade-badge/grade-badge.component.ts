import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

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
      class="grade-badge"
      [style.background-color]="color"
      [attr.aria-label]="grade ? 'الدرجة: ' + grade : 'لم يتم التفتيش بعد'"
    >
      {{ grade ?? '—' }}
    </div>
  `,
  styles: [
    `.grade-badge {
      width: 96px;
      height: 96px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 48px;
      font-weight: bold;
      border-radius: 12px;
      margin: 0 auto;
    }`,
  ],
})
export class GradeBadgeComponent {
  @Input() grade: 'A' | 'B' | 'C' | 'D' | null = null;

  get color(): string {
    return this.grade ? GRADE_COLORS[this.grade] : '#9e9e9e';
  }
}
