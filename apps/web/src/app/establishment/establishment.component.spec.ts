import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { EstablishmentComponent } from './establishment.component';

// Component state (establishment/notFound) is exposed as signals so zoneless
// change detection actually re-renders the template when async HTTP data
// arrives — a plain property mutated inside .subscribe() does not trigger a
// re-render under zoneless CD, which is what these tests guard against.
describe('EstablishmentComponent', () => {
  async function setup(slug: string) {
    await TestBed.configureTestingModule({
      imports: [EstablishmentComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ slug }) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(EstablishmentComponent);
    fixture.detectChanges();
    const httpMock = TestBed.inject(HttpTestingController);
    return { fixture, httpMock };
  }

  it('sets notFound when the API call errors (e.g. unknown slug or unreachable API)', async () => {
    const { fixture, httpMock } = await setup('does-not-exist');
    httpMock
      .expectOne('http://localhost:3000/api/public/establishments/does-not-exist')
      .error(new ProgressEvent('error'), { status: 404 });

    expect(fixture.componentInstance.notFound()).toBe(true);
    expect(fixture.componentInstance.establishment()).toBeNull();
    httpMock.verify();
  });

  it('populates establishment on a successful response', async () => {
    const { fixture, httpMock } = await setup('golden-oven-nablus');
    httpMock.expectOne('http://localhost:3000/api/public/establishments/golden-oven-nablus').flush({
      slug: 'golden-oven-nablus',
      nameAr: 'فرن الذهب',
      nameEn: 'Golden Oven',
      category: 'bakery',
      grade: 'B',
      score: 80,
      lastInspectionAt: '2026-01-01',
      openViolations: [],
      history: [],
      status: 'ACTIVE',
    });

    expect(fixture.componentInstance.notFound()).toBe(false);
    expect(fixture.componentInstance.establishment()?.nameAr).toBe('فرن الذهب');
    httpMock.verify();
  });

  it('actually renders the establishment name in the DOM after data arrives', async () => {
    const { fixture, httpMock } = await setup('golden-oven-nablus');
    httpMock.expectOne('http://localhost:3000/api/public/establishments/golden-oven-nablus').flush({
      slug: 'golden-oven-nablus',
      nameAr: 'فرن الذهب',
      nameEn: 'Golden Oven',
      category: 'bakery',
      grade: 'B',
      score: 80,
      lastInspectionAt: '2026-01-01',
      openViolations: [],
      history: [],
      status: 'ACTIVE',
    });

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('فرن الذهب');
    httpMock.verify();
  });
});
