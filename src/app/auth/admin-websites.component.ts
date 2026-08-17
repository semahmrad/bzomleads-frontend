import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminWebsiteProject } from './auth.models';
import { AuthService } from './auth.service';

type WebsiteStatusFilter = 'all' | AdminWebsiteProject['status'];
type DeliveryFilter = 'all' | 'sent' | 'not-sent';

@Component({
  selector: 'app-admin-websites',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-websites.component.html',
  styleUrl: './admin-websites.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminWebsitesComponent implements OnInit {
  readonly initialCommercialId = input('');

  private readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private deliveryProjectId = '';
  private readonly dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  protected readonly projects = signal<AdminWebsiteProject[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly searchQuery = signal('');
  protected readonly commercialId = signal('all');
  protected readonly statusFilter = signal<WebsiteStatusFilter>('all');
  protected readonly deliveryFilter = signal<DeliveryFilter>('all');
  protected readonly selectedProjectId = signal<string | null>(null);
  protected readonly copiedProjectId = signal<string | null>(null);
  protected readonly copiedLink = signal<'client' | 'github' | null>(null);
  protected readonly savingDelivery = signal(false);
  protected readonly deliverySuccess = signal('');

  protected readonly deliveryForm = this.formBuilder.nonNullable.group({
    clientName: ['', [Validators.maxLength(120)]],
    clientContact: ['', [Validators.maxLength(180)]],
    notes: ['', [Validators.maxLength(1000)]],
  });

  protected readonly commercialOptions = computed(() => {
    const seen = new Map<
      string,
      { id: string; name: string; username: string; country: string; count: number }
    >();
    for (const project of this.projects()) {
      if (!project.createdByUserId) {
        continue;
      }
      const existing = seen.get(project.createdByUserId);
      if (existing) {
        existing.count++;
        continue;
      }
      seen.set(project.createdByUserId, {
        id: project.createdByUserId,
        name: project.createdByDisplayName || 'Commercial inconnu',
        username: project.createdByUsername || '',
        country: project.commercialCountries.map((country) => country.code).join(' · ')
          || project.commercialCountryCode
          || '',
        count: 1,
      });
    }
    return [...seen.values()].sort((left, right) => left.name.localeCompare(right.name, 'fr'));
  });

  protected readonly filteredProjects = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('fr');
    const commercialId = this.commercialId();
    const status = this.statusFilter();
    const delivery = this.deliveryFilter();

    return this.projects().filter((project) => {
      const matchesQuery =
        !query ||
        [
          project.businessName,
          project.createdByDisplayName,
          project.createdByUsername,
          project.commercialCountryName,
          project.templateName,
          project.projectId,
        ].some((value) => value?.toLocaleLowerCase('fr').includes(query));
      const matchesCommercial =
        commercialId === 'all' || project.createdByUserId === commercialId;
      const matchesStatus = status === 'all' || project.status === status;
      const matchesDelivery =
        delivery === 'all' ||
        (delivery === 'sent' ? project.clientLinkSent : !project.clientLinkSent);
      return matchesQuery && matchesCommercial && matchesStatus && matchesDelivery;
    });
  });

  protected readonly selectedProject = computed(() => {
    const filtered = this.filteredProjects();
    const selectedId = this.selectedProjectId();
    return filtered.find((project) => project.projectId === selectedId) ?? filtered[0] ?? null;
  });

  protected readonly totals = computed(() => {
    const projects = this.projects();
    return {
      websites: projects.length,
      published: projects.filter((project) => project.status === 'Published').length,
      edited: projects.filter((project) => project.hasBeenEdited).length,
      delivered: projects.filter((project) => project.clientLinkSent).length,
      commercials: new Set(
        projects.map((project) => project.createdByUserId).filter((id): id is string => !!id),
      ).size,
    };
  });

  constructor() {
    effect(() => {
      const requestedCommercialId = this.initialCommercialId();
      if (requestedCommercialId) {
        this.commercialId.set(requestedCommercialId);
      }
    });
    effect(() => {
      const project = this.selectedProject();
      if (!project || project.projectId === this.deliveryProjectId) {
        return;
      }
      this.deliveryProjectId = project.projectId;
      this.deliverySuccess.set('');
      this.deliveryForm.reset({
        clientName: project.clientName ?? '',
        clientContact: project.clientContact ?? '',
        notes: project.clientDeliveryNotes ?? '',
      });
    });
  }

  ngOnInit(): void {
    void this.loadProjects();
  }

  protected selectProject(project: AdminWebsiteProject): void {
    this.selectedProjectId.set(project.projectId);
  }

  protected updateSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.selectedProjectId.set(null);
  }

  protected selectCommercial(commercialId: string): void {
    this.commercialId.set(commercialId);
    this.selectedProjectId.set(null);
  }

  protected updateStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as WebsiteStatusFilter);
    this.selectedProjectId.set(null);
  }

  protected updateDeliveryFilter(event: Event): void {
    this.deliveryFilter.set((event.target as HTMLSelectElement).value as DeliveryFilter);
    this.selectedProjectId.set(null);
  }

  protected clearFilters(): void {
    this.searchQuery.set('');
    this.commercialId.set('all');
    this.statusFilter.set('all');
    this.deliveryFilter.set('all');
    this.selectedProjectId.set(null);
  }

  protected async copyProjectId(projectId: string): Promise<void> {
    this.copiedProjectId.set(projectId);
    await this.copyText(projectId);
    window.setTimeout(() => this.copiedProjectId.set(null), 1600);
  }

  protected async copyUrl(kind: 'client' | 'github', url: string): Promise<void> {
    this.copiedLink.set(kind);
    await this.copyText(url);
    window.setTimeout(() => this.copiedLink.set(null), 1600);
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date inconnue' : this.dateFormatter.format(date);
  }

  protected async saveClientDelivery(clientLinkSent: boolean): Promise<void> {
    const project = this.selectedProject();
    if (!project || this.deliveryForm.invalid) {
      this.deliveryForm.markAllAsTouched();
      return;
    }

    try {
      this.savingDelivery.set(true);
      this.error.set('');
      this.deliverySuccess.set('');
      const values = this.deliveryForm.getRawValue();
      await this.auth.updateClientDelivery(project.projectId, {
        clientLinkSent,
        clientName: values.clientName.trim(),
        clientContact: values.clientContact.trim(),
        notes: values.notes.trim(),
      });
      await this.loadProjects(false);
      this.deliverySuccess.set(
        clientLinkSent
          ? 'Le lien est maintenant marque comme envoye au client.'
          : 'Le statut d envoi au client a ete retire.',
      );
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      this.savingDelivery.set(false);
    }
  }

  protected statusLabel(status: AdminWebsiteProject['status']): string {
    switch (status) {
      case 'Published':
        return 'En ligne';
      case 'RepositoryReady':
        return 'Depot cree';
      default:
        return 'Genere';
    }
  }

  protected ownerInitials(project: AdminWebsiteProject): string {
    const value = project.createdByDisplayName || project.createdByUsername || 'NA';
    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  protected shortId(projectId: string): string {
    return `${projectId.slice(0, 8)}...${projectId.slice(-4)}`;
  }

  private async loadProjects(showLoader = true): Promise<void> {
    try {
      if (showLoader) {
        this.loading.set(true);
      }
      this.error.set('');
      const projects = await this.auth.getAdminWebsites();
      this.projects.set(projects);
    } catch (error) {
      this.error.set(this.auth.resolveError(error));
    } finally {
      if (showLoader) {
        this.loading.set(false);
      }
    }
  }

  private async copyText(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  }
}
