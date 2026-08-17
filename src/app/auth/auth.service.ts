import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminUser,
  AdminWebsiteProject,
  AiSettings,
  AuthUser,
  CountryOption,
  CreateUserRequest,
  UpdateUserRequest,
  UpdateClientDeliveryRequest,
  UpdateAiSettingsRequest,
} from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private initialization?: Promise<void>;

  readonly currentUser = signal<AuthUser | null>(null);
  readonly ready = signal(false);

  initialize(): Promise<void> {
    if (this.initialization) {
      return this.initialization;
    }

    this.initialization = this.loadSession();
    return this.initialization;
  }

  async login(username: string, password: string): Promise<AuthUser> {
    const user = await firstValueFrom(
      this.http.post<AuthUser>('/api/auth/login', { username, password }),
    );
    this.currentUser.set(user);
    this.ready.set(true);
    return user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
    const user = await firstValueFrom(
      this.http.post<AuthUser>('/api/auth/change-password', { currentPassword, newPassword }),
    );
    this.currentUser.set(user);
    return user;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>('/api/auth/logout', {}));
    } finally {
      this.currentUser.set(null);
      this.ready.set(true);
    }
  }

  getCountries(): Promise<CountryOption[]> {
    return firstValueFrom(this.http.get<CountryOption[]>('/api/meta/countries'));
  }

  getAiSettings(): Promise<AiSettings> {
    return firstValueFrom(this.http.get<AiSettings>('/api/account/ai-settings'));
  }

  async saveAiSettings(payload: UpdateAiSettingsRequest): Promise<AuthUser> {
    const user = await firstValueFrom(
      this.http.put<AuthUser>('/api/account/ai-settings', payload),
    );
    this.currentUser.set(user);
    return user;
  }

  getAdminUsers(): Promise<AdminUser[]> {
    return firstValueFrom(this.http.get<AdminUser[]>('/api/admin/users'));
  }

  getAdminWebsites(): Promise<AdminWebsiteProject[]> {
    return firstValueFrom(this.http.get<AdminWebsiteProject[]>('/api/admin/websites'));
  }

  updateClientDelivery(
    projectId: string,
    payload: UpdateClientDeliveryRequest,
  ): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(
        `/api/admin/websites/${encodeURIComponent(projectId)}/client-delivery`,
        payload,
      ),
    );
  }

  createUser(payload: CreateUserRequest): Promise<AuthUser> {
    return firstValueFrom(this.http.post<AuthUser>('/api/admin/users', payload));
  }

  updateUser(userId: string, payload: UpdateUserRequest): Promise<AuthUser> {
    return firstValueFrom(
      this.http.patch<AuthUser>(`/api/admin/users/${encodeURIComponent(userId)}`, payload),
    );
  }

  resetUserPassword(userId: string, newPassword: string): Promise<AuthUser> {
    return firstValueFrom(
      this.http.post<AuthUser>(
        `/api/admin/users/${encodeURIComponent(userId)}/reset-password`,
        { newPassword },
      ),
    );
  }

  resolveError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const apiError = error.error as { error?: unknown } | null;
      if (typeof apiError?.error === 'string' && apiError.error.trim()) {
        return apiError.error;
      }
      if (error.status === 401) {
        return 'Identifiants incorrects.';
      }
      if (error.status === 403) {
        return 'Cette action est reservee a l administrateur.';
      }
      return error.message || 'La requete a echoue.';
    }

    return error instanceof Error ? error.message : 'Une erreur inconnue est survenue.';
  }

  private async loadSession(): Promise<void> {
    try {
      const user = await firstValueFrom(this.http.get<AuthUser>('/api/auth/me'));
      this.currentUser.set(user);
    } catch {
      this.currentUser.set(null);
    } finally {
      this.ready.set(true);
    }
  }
}
