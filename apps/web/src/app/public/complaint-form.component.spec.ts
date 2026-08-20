import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ComplaintFormComponent } from './complaint-form.component';
import { EstablishmentService } from './establishment.service';

function build() {
  TestBed.configureTestingModule({
    imports: [ComplaintFormComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: new Map([['slug', 'golden-oven-nablus']]) } },
      },
      {
        provide: EstablishmentService,
        useValue: { getBySlug: () => of({ nameAr: 'الفرن الذهبي' }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ComplaintFormComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ComplaintFormComponent', () => {
  it('binds submit to the native event and calls preventDefault, never a real navigation', () => {
    // Regression test: (ngSubmit) requires FormsModule/NgForm, which this
    // signal-based component does not import. Without it, ngSubmit silently
    // never fires and the browser performs a real GET, reloading the page
    // with the form fields as a query string. This asserts the handler is
    // wired to the native `submit` event and stops that navigation.
    const fixture = build();
    const component = fixture.componentInstance;
    const form = fixture.nativeElement.querySelector('form');
    expect(form).toBeTruthy();

    const event = new Event('submit', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    component.category.set('PESTS');
    component.description.set('صراصير قرب منطقة التحضير');

    form.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
  });

  it('does not submit while no category is chosen', () => {
    const fixture = build();
    const component = fixture.componentInstance;
    expect(component.canSubmit()).toBe(false);
    component.description.set('وصف كافٍ');
    expect(component.canSubmit()).toBe(false);
  });

  it('does not submit with an empty or whitespace-only description', () => {
    const fixture = build();
    const component = fixture.componentInstance;
    component.category.set('PESTS');
    component.description.set('   ');
    expect(component.canSubmit()).toBe(false);
  });

  it('becomes submittable once both a category and a real description exist', () => {
    const fixture = build();
    const component = fixture.componentInstance;
    component.category.set('PESTS');
    component.description.set('صراصير قرب منطقة التحضير');
    expect(component.canSubmit()).toBe(true);
  });
});
