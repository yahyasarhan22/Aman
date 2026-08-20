import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { VIOLATION_FORMS, arabicCount, type Grade } from '@aman/shared';
import { GradeBadgeComponent } from '../ui/grade-badge.component';
import { EstablishmentPublicDto, EstablishmentService } from './establishment.service';
import { T } from '../core/strings';

const CATEGORY_AR: Record<string, string> = {
  BUTCHER: 'ملحمة',
  RESTAURANT: 'مطعم',
  BAKERY: 'مخبز',
  CAFE: 'مقهى',
  RETAIL: 'بيع مواد معلّبة',
};

@Component({
  selector: 'app-establishment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, GradeBadgeComponent],
  templateUrl: './establishment.component.html',
  styleUrl: './establishment.component.css',
})
export class EstablishmentComponent {
  readonly t = T;
  readonly violationCount = (n: number) => arabicCount(n, VIOLATION_FORMS);

  private route = inject(ActivatedRoute);
  private service = inject(EstablishmentService);

  readonly establishment = signal<EstablishmentPublicDto | null>(null);
  readonly notFound = signal(false);
  readonly loading = signal(true);

  readonly categoryAr = computed(() => {
    const category = this.establishment()?.category;
    return category ? (CATEGORY_AR[category] ?? category) : '';
  });

  constructor() {
    const slug = this.route.snapshot.paramMap.get('slug')!;
    this.service.getBySlug(slug).subscribe({
      next: (data) => {
        this.establishment.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.notFound.set(true);
        this.loading.set(false);
      },
    });
  }

  asGrade(grade: string): Grade {
    return grade as Grade;
  }
}
