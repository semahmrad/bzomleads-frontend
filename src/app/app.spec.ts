import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController).expectOne('/api/auth/me').flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title for an authenticated user', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/auth/me').flush({
      id: 'user-1',
      username: 'ons.hamdi',
      displayName: 'Ons Hamdi',
      role: 'User',
      countryCode: 'FR',
      countryName: 'France',
      allowedCountries: [{ code: 'FR', name: 'France' }],
      mustChangePassword: false,
      aiConfigured: true,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/websites/projects').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain(
      'Construis une liste de prospects locale, claire et exportable en quelques clics.',
    );
  });
});
