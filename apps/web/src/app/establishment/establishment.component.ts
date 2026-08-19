import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GradeBadgeComponent } from '../grade-badge/grade-badge.component';
import { EstablishmentPublicDto, EstablishmentService } from './establishment.service';

@Component({
  selector: 'app-establishment',
  standalone: true,
  imports: [CommonModule, RouterLink, GradeBadgeComponent],
  templateUrl: './establishment.component.html',
})
export class EstablishmentComponent implements OnInit {
  establishment: EstablishmentPublicDto | null = null;
  notFound = false;

  constructor(private route: ActivatedRoute, private service: EstablishmentService) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug')!;
    this.service.getBySlug(slug).subscribe({
      next: (data) => (this.establishment = data),
      error: () => (this.notFound = true),
    });
  }
}
