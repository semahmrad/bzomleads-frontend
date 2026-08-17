import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminUser, CountryOption } from './auth.models';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-admin-users',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent implements OnInit {
  readonly sitesRequested = output<string>();

  protected readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly countries = signal<CountryOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly managing = signal(false);
  protected readonly selectedUser = signal<AdminUser | null>(null);
  protected readonly error = signal('');
  protected readonly success = signal('');

  protected readonly commercialUsers = computed(() =>
    this.users().filter((user) => user.role === 'User'),
  );
  protected readonly totals = computed(() => {
    const users = this.commercialUsers();
    return {
      commercials: users.length,
      active: users.filter((user) => user.isActive).length,
      suspended: users.filter((user) => !user.isActive).length,
      websites: users.reduce((sum, user) => sum + user.websitesCreatedCount, 0),
      websiteEdits: users.reduce((sum, user) => sum + user.websitesEditedCount, 0),
    };
  });

  protected readonly userForm = this.formBuilder.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.required, Validators.minLength(3)]],
    countryCodes: this.formBuilder.nonNullable.control<string[]>(['FR'], [Validators.required]),
    password: ['', [Validators.required, Validators.minLength(10)]],
  });

  protected readonly editForm = this.formBuilder.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.required, Validators.minLength(3)]],
    countryCodes: this.formBuilder.nonNullable.control<string[]>(['FR'], [Validators.required]),
  });

  protected readonly resetPasswordForm = this.formBuilder.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
  });

  ngOnInit(): void {
    void this.loadDashboard();
  }

  protected async createUser(): Promise<void> {
    this.error.set('');
    this.success.set('');
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const values = this.userForm.getRawValue();
    try {
      this.creating.set(true);
      const user = await this.auth.createUser({
        displayName: values.displayName.trim(),
        username: values.username.trim().toLowerCase(),
        countryCodes: values.countryCodes,
        password: values.password,
      });
      this.success.set(
        `Compte ${user.displayName} cree avec ${user.allowedCountries.length} pays autorise(s). Le mot de passe devra etre change a la premiere connexion.`,
      );
      this.userForm.reset({ displayName: '', username: '', countryCodes: ['FR'], password: '' });
      await this.loadUsers();
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.creating.set(false);
    }
  }

  protected manageUser(user: AdminUser): void {
    this.error.set('');
    this.success.set('');
    this.selectedUser.set(user);
    this.editForm.reset({
      displayName: user.displayName,
      username: user.username,
      countryCodes: user.allowedCountries.map((country) => country.code),
    });
    this.resetPasswordForm.reset({ newPassword: '' });
  }

  protected cancelManagement(): void {
    this.selectedUser.set(null);
    this.resetPasswordForm.reset({ newPassword: '' });
  }

  protected viewUserSites(userId: string): void {
    this.sitesRequested.emit(userId);
  }

  protected async saveUser(): Promise<void> {
    const selected = this.selectedUser();
    if (!selected || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const values = this.editForm.getRawValue();
    try {
      this.managing.set(true);
      this.error.set('');
      await this.auth.updateUser(selected.id, {
        displayName: values.displayName.trim(),
        username: values.username.trim().toLowerCase(),
        countryCodes: values.countryCodes,
      });
      this.success.set(`Le compte de ${values.displayName.trim()} a ete mis a jour.`);
      await this.loadUsers();
      this.cancelManagement();
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.managing.set(false);
    }
  }

  protected async toggleUserAccess(user: AdminUser): Promise<void> {
    try {
      this.managing.set(true);
      this.error.set('');
      this.success.set('');
      await this.auth.updateUser(user.id, { isActive: !user.isActive });
      this.success.set(
        user.isActive
          ? `Le compte de ${user.displayName} est suspendu.`
          : `Le compte de ${user.displayName} est de nouveau actif.`,
      );
      await this.loadUsers();
      if (this.selectedUser()?.id === user.id) {
        this.cancelManagement();
      }
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.managing.set(false);
    }
  }

  protected async resetPassword(): Promise<void> {
    const selected = this.selectedUser();
    if (!selected || this.resetPasswordForm.invalid) {
      this.resetPasswordForm.markAllAsTouched();
      return;
    }

    const password = this.resetPasswordForm.getRawValue().newPassword;
    try {
      this.managing.set(true);
      this.error.set('');
      await this.auth.resetUserPassword(selected.id, password);
      this.success.set(
        `Mot de passe temporaire defini pour ${selected.displayName}. Il devra le remplacer a sa prochaine connexion.`,
      );
      this.resetPasswordForm.reset({ newPassword: '' });
      await this.loadUsers();
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.managing.set(false);
    }
  }

  protected toggleCountry(mode: 'create' | 'edit', countryCode: string): void {
    const control = mode === 'create'
      ? this.userForm.controls.countryCodes
      : this.editForm.controls.countryCodes;
    const current = control.value;
    control.setValue(
      current.includes(countryCode)
        ? current.filter((code) => code !== countryCode)
        : [...current, countryCode],
    );
    control.markAsTouched();
  }

  protected isCountrySelected(mode: 'create' | 'edit', countryCode: string): boolean {
    const values = mode === 'create'
      ? this.userForm.controls.countryCodes.value
      : this.editForm.controls.countryCodes.value;
    return values.includes(countryCode);
  }

  protected formatDate(value: string | null): string {
    if (!value) {
      return 'Jamais';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date inconnue' : this.dateFormatter.format(date);
  }

  private async loadDashboard(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set('');
      const [users, countries] = await Promise.all([
        this.auth.getAdminUsers(),
        this.auth.getCountries(),
      ]);
      this.users.set(users);
      this.countries.set(countries);
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadUsers(): Promise<void> {
    this.users.set(await this.auth.getAdminUsers());
  }
}
