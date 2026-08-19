import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GradeBadgeComponent } from '../grade-badge/grade-badge.component';
import { EstablishmentPublicDto, EstablishmentService } from './establishment.service';

@Component({
  selector: 'app-establishment',
  standalone: true,
  imports: [CommonModule, GradeBadgeComponent],
  templateUrl: './establishment.component.html',
  styleUrl: './establishment.component.css',
})
export class EstablishmentComponent implements OnInit {
  establishment = signal<EstablishmentPublicDto | null>(null);
  notFound = signal(false);

  constructor(private route: ActivatedRoute, private service: EstablishmentService) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug')!;
    this.service.getBySlug(slug).subscribe({
      next: (data) => this.establishment.set(data),
      error: () => this.notFound.set(true),
    });
  }
}
