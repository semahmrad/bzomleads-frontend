import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, firstValueFrom, startWith } from 'rxjs';
import {
  EmailCampaignSendRequest,
  EmailCampaignSendResponse,
} from './models/email-campaign.models';
import {
  LeadSearchResponse,
  LeadSearchResultItem,
  LeadStreamMessage,
  WebsiteGenerationRequest,
  WebsiteProjectResponse,
} from './models/lead-search.models';
import { EmailCampaignApiService } from './services/email-campaign-api.service';
import { LeadFinderApiService } from './services/lead-finder-api.service';
import { AdminUsersComponent } from './auth/admin-users.component';
import { AdminWebsitesComponent } from './auth/admin-websites.component';
import { AccountSettingsComponent } from './auth/account-settings.component';
import { AuthPanelComponent } from './auth/auth-panel.component';
import { AuthService } from './auth/auth.service';

type BusinessTypeOption = {
  value: string;
  label: string;
  hint: string;
};

type WorkspaceHighlight = {
  label: string;
  value: string;
  tone: string;
};

type GuideCard = {
  title: string;
  description: string;
};

type CampaignRecipientOption = {
  key: string;
  placeId: string;
  businessName: string;
  businessLabel: string;
  emailAddress: string;
  websiteUri?: string | null;
  selected: boolean;
  isManual: boolean;
};

type WebsiteGenerationNotice = {
  tone: 'success' | 'error';
  text: string;
};

type WebsiteStudioMode = 'generate' | 'edit';
type LeadSearchState = 'idle' | 'running' | 'stopped' | 'completed' | 'error';
type AppWorkspaceView = 'prospection' | 'admin-commercials' | 'admin-sites';

@Component({
  selector: 'app-root',
  imports: [
    ReactiveFormsModule,
    AuthPanelComponent,
    AccountSettingsComponent,
    AdminUsersComponent,
    AdminWebsitesComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly formBuilder = inject(FormBuilder);
  private readonly leadFinderApi = inject(LeadFinderApiService);
  private readonly emailCampaignApi = inject(EmailCampaignApiService);
  protected readonly auth = inject(AuthService);
  private copyResetHandle?: ReturnType<typeof setTimeout>;
  private campaignRecipientSequence = 0;
  private loadedProjectUserId: string | null = null;
  private readonly projectDateFormatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  private readonly defaultCampaignBody = [
    '<p>Bonjour {{recipientName}},</p>',
    '<p>Je me permets de vous contacter pour vous proposer une solution adaptee a votre activite.</p>',
    '<p>Si cela vous interesse, je peux vous envoyer une proposition simple et rapide.</p>',
    '<p>Bien cordialement,<br />Votre nom</p>',
  ].join('');

  protected readonly composerEditor = viewChild<ElementRef<HTMLDivElement>>('composerEditor');
  protected readonly composerImageInput = viewChild<ElementRef<HTMLInputElement>>('composerImageInput');

  protected readonly businessTypeOptions: BusinessTypeOption[] = [
    {
      value: 'restaurant',
      label: 'Restaurant',
      hint: 'Ideal pour la restauration, la distribution CHR et les ventes terrain locales.',
    },
    { value: 'bar', label: 'Bar', hint: 'Pubs, bars lounge et etablissements de quartier.' },
    { value: 'cafe', label: 'Cafe', hint: 'Coffee shops, salons de the et snacks premium.' },
    { value: 'store', label: 'Boutique', hint: 'Commerce de detail generaliste ou multi-rayons.' },
    {
      value: 'clothing_store',
      label: 'Boutique mode',
      hint: 'Pret-a-porter, chaussures et accessoires.',
    },
    {
      value: 'grocery_store',
      label: 'Epicerie',
      hint: 'Epiceries de ville et commerces de proximite.',
    },
    { value: 'bakery', label: 'Boulangerie', hint: 'Boulangeries, patisseries et points chauds.' },
    {
      value: 'beauty_salon',
      label: 'Salon beaute',
      hint: 'Coiffure, soins et activites bien-etre.',
    },
    {
      value: 'car_repair',
      label: 'Garage / Mécanicien',
      hint: 'Garages, carrosseries et ateliers de réparation automobile.',
    },
    {
      value: 'medical_office',
      label: 'Cabinet médical / Dentiste',
      hint: 'Cabinets de médecins, dentistes, professions de santé et cliniques.',
    },
    {
      value: 'hotel',
      label: 'Hôtel / Hébergement',
      hint: 'Hôtels, auberges, chambres d\'hôtes et hébergements touristiques.',
    },
  ];

  protected readonly leadForm = this.formBuilder.nonNullable.group({
    countryCode: ['', [Validators.required]],
    locationQuery: ['', [Validators.required]],
    businessType: ['restaurant', [Validators.required]],
    maxResults: [10, [Validators.required, Validators.min(1), Validators.max(5000)]],
    websiteFilter: ['all'],
    extractEmailsFromSites: [true],
    useGeminiForEmailExtraction: [true],
  });

  protected readonly emailCampaignForm = this.formBuilder.nonNullable.group({
    host: ['', [Validators.required]],
    port: [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
    secureMode: ['starttls', [Validators.required]],
    username: [''],
    password: [''],
    fromName: [''],
    fromEmail: ['', [Validators.required, Validators.email]],
    subject: ['', [Validators.required]],
  });

  private readonly leadFormState = toSignal(
    this.leadForm.valueChanges.pipe(startWith(this.leadForm.getRawValue())),
    { initialValue: this.leadForm.getRawValue() },
  );

  protected readonly leadLoading = signal(false);
  protected readonly leadError = signal('');
  protected readonly leadErrorHint = signal('');
  protected readonly leadSearchState = signal<LeadSearchState>('idle');
  protected readonly leadResponse = signal<LeadSearchResponse | null>(null);
  protected readonly copiedPlaceId = signal<string | null>(null);
  protected readonly websiteProjectBusyPlaceId = signal<string | null>(null);
  protected readonly websiteProjectBusyMode = signal<WebsiteStudioMode | null>(null);
  protected readonly websiteGenerationNotices = signal<Record<string, WebsiteGenerationNotice>>({});
  protected readonly websiteProjects = signal<Record<string, WebsiteProjectResponse[]>>({});
  protected readonly websiteStudioOpen = signal(false);
  protected readonly websiteStudioMode = signal<WebsiteStudioMode>('generate');
  protected readonly websiteStudioItem = signal<LeadSearchResultItem | null>(null);
  protected readonly websiteStudioSelectedProjectId = signal<string | null>(null);
  protected readonly websiteStudioLogoFile = signal<File | null>(null);
  protected readonly websiteStudioImageFiles = signal<File[]>([]);
  protected readonly websiteStudioEditPrompt = signal('');
  protected readonly workspaceView = signal<AppWorkspaceView>(this.workspaceFromLocation());
  protected readonly adminCommercialFilter = signal(this.commercialFilterFromLocation());
  protected readonly accountSettingsOpen = signal(false);

  protected readonly emailCampaignOpen = signal(false);
  protected readonly emailCampaignLoading = signal(false);
  protected readonly emailCampaignError = signal('');
  protected readonly emailCampaignResult = signal<EmailCampaignSendResponse | null>(null);
  protected readonly emailComposerHtml = signal('');
  protected readonly emailComposerMode = signal<'visual' | 'html'>('visual');
  protected readonly campaignRecipients = signal<CampaignRecipientOption[]>([]);

  protected readonly leadItems = computed(() => this.leadResponse()?.items ?? []);
  protected readonly searchStateTitle = computed(() => {
    switch (this.leadSearchState()) {
      case 'running':
        return `Recherche en cours · ${this.leadItems().length} resultat(s) recu(s)`;
      case 'stopped':
        return 'Recherche arretee · resultats conserves';
      case 'completed':
        return `Recherche terminee · ${this.leadItems().length} resultat(s)`;
      case 'error':
        return 'La recherche a rencontre un probleme';
      default:
        return 'Pret a lancer une recherche';
    }
  });
  protected readonly searchStateDescription = computed(() => {
    switch (this.leadSearchState()) {
      case 'running':
        return 'Les prospects arrivent progressivement. Arrete la recherche avant de modifier les criteres.';
      case 'stopped':
        return 'Tu peux modifier la ville, le type, les filtres ou la quantite puis continuer.';
      case 'completed':
        return 'Les resultats sont enregistres. Une nouvelle recherche reprendra depuis les donnees deja collectees.';
      case 'error':
        return 'Corrige le point indique ci-dessous puis relance sans perdre les prospects deja enregistres.';
      default:
        return 'Configure tes criteres puis lance la collecte.';
    }
  });
  protected readonly activeBusinessType = computed(
    () =>
      this.businessTypeOptions.find(
        (option) => option.value === (this.leadFormState().businessType ?? 'restaurant'),
      ) ?? this.businessTypeOptions[0],
  );
  protected readonly activeSearchCountry = computed(() => {
    const user = this.auth.currentUser();
    const selectedCode = this.leadFormState().countryCode;
    return user?.allowedCountries.find((country) => country.code === selectedCode)
      ?? user?.allowedCountries[0]
      ?? null;
  });
  protected readonly websiteStudioProjects = computed(() => {
    const item = this.websiteStudioItem();
    return item ? this.websiteProjectsForPlace(item.placeId) : [];
  });
  protected readonly websiteStudioActiveProject = computed(() => {
    const projects = this.websiteStudioProjects();
    const selectedProjectId = this.websiteStudioSelectedProjectId();
    return (
      projects.find((project) => project.projectId === selectedProjectId) ??
      projects[0] ??
      null
    );
  });
  protected readonly websiteStudioBusy = computed(() => {
    const item = this.websiteStudioItem();
    return !!item && this.websiteProjectBusyPlaceId() === item.placeId;
  });
  protected readonly websiteStudioLogoFileName = computed(
    () => this.websiteStudioLogoFile()?.name ?? '',
  );
  protected readonly websiteStudioImageFileNames = computed(() =>
    this.websiteStudioImageFiles().map((file) => file.name),
  );

  protected readonly availableCampaignRecipientCount = computed(() => {
    const seen = new Set<string>();
    let count = 0;

    for (const item of this.leadItems()) {
      for (const email of item.emailAddresses) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || seen.has(normalizedEmail)) {
          continue;
        }

        seen.add(normalizedEmail);
        count++;
      }
    }

    return count;
  });

  protected readonly campaignRecipientDisplayCount = computed(() => {
    const current = this.campaignRecipients();
    return current.length ? current.length : this.availableCampaignRecipientCount();
  });

  protected readonly selectedCampaignRecipients = computed(() =>
    this.campaignRecipients().filter((recipient) => recipient.selected),
  );

  protected readonly canLaunchCampaignEmail = computed(
    () => !!this.leadResponse() && !this.leadLoading(),
  );

  protected readonly scoreCards = computed(() => {
    const response = this.leadResponse();

    return [
      { label: 'Prospects trouves', value: response?.total ?? 0, tone: 'blue' },
      { label: 'Deja en base', value: response?.existingResultsCount ?? 0, tone: 'green' },
      { label: 'Nouveaux ajoutes', value: response?.newResultsCount ?? 0, tone: 'amber' },
      { label: 'Emails trouves', value: response?.emailCount ?? 0, tone: 'pink' },
    ];
  });

  protected readonly leadDatabaseSummary = computed(() => {
    const response = this.leadResponse();
    if (!response) {
      return '';
    }

    if (response.newResultsCount > 0) {
      return `${response.existingResultsCount} fiches venaient deja de la base, puis ${response.newResultsCount} nouvelles fiches ont ete ajoutees automatiquement.`;
    }

    return `${response.existingResultsCount} fiches ont ete chargees depuis la base pour cette recherche. Aucun nouveau resultat n a ete ajoute cette fois.`;
  });

  protected readonly workspaceHighlights = computed<WorkspaceHighlight[]>(() => {
    const values = this.leadFormState();
    const location = (values.locationQuery ?? '').trim() || 'Zone a definir';
    const isWithoutWebsiteOnly = values.websiteFilter === 'without_website';
    const targeting = values.websiteFilter === 'without_website'
      ? 'Sans site web uniquement'
      : values.websiteFilter === 'with_website'
        ? 'Avec site web uniquement'
        : 'Tous les commerces';
    const enrichment = isWithoutWebsiteOnly
      ? 'Ciblage sans site web'
      : values.extractEmailsFromSites
        ? values.useGeminiForEmailExtraction
          ? 'Contacts publics + analyse avancee'
          : 'Contacts publics depuis le site'
        : 'Sans enrichissement de contacts';
    const volume = `+${values.maxResults ?? 10} nouvelles max`;

    return [
      { label: 'Zone active', value: location, tone: 'cyan' },
      { label: 'Segment', value: this.activeBusinessType().label, tone: 'blue' },
      { label: 'Ciblage', value: targeting, tone: 'amber' },
      { label: 'Enrichissement', value: enrichment, tone: 'violet' },
      { label: 'Nouveaux resultats', value: volume, tone: 'green' },
    ];
  });

  protected readonly resultFilterChips = computed(() => {
    const response = this.leadResponse();
    if (!response) {
      return [];
    }

    return [
      `Zone: ${response.query}`,
      this.activeBusinessType().label,
      this.formatWebsiteFilter(response.websiteFilter),
      response.extractEmailsFromSites ? 'Contacts publics actifs' : 'Recherche simple',
    ];
  });

  protected readonly leadLoadingMessage = computed(() => {
    const values = this.leadFormState();

    if (values.extractEmailsFromSites && values.useGeminiForEmailExtraction) {
      return `Nous rechargeons d abord les fiches deja en base, puis nous cherchons jusqu a ${values.maxResults ?? 10} nouveaux commerces et analysons leurs pages publiques pour recuperer un maximum de contacts utiles.`;
    }

    if (values.extractEmailsFromSites) {
      return `Nous rechargeons d abord les fiches deja en base, puis nous cherchons jusqu a ${values.maxResults ?? 10} nouveaux commerces et recuperons les contacts publics visibles sur leurs sites.`;
    }

    return `Nous rechargeons d abord les fiches deja en base, puis nous cherchons jusqu a ${values.maxResults ?? 10} nouveaux commerces correspondant a la zone et au segment selectionnes.`;
  });

  protected readonly campaignNotes = [
    'Choisis une ville, un quartier ou une adresse precise pour obtenir une prospection locale plus propre.',
    'Le filtre sans site web est parfait si tu vends une creation de site, une refonte ou une presence digitale.',
    'Active la recuperation des contacts publics pour gagner du temps au moment de la prise de contact.',
  ];

  protected readonly campaignFlow = [
    'Choisis une zone locale et un type de commerce.',
    'Active uniquement les options utiles pour ta campagne.',
    'Lance la recherche puis telecharge les resultats en CSV ou envoie une campagne email.',
  ];

  protected readonly usageScenarios: GuideCard[] = [
    {
      title: 'Prospection produits',
      description:
        'Cible rapidement les commerces de ta zone pour preparer une campagne commerciale terrain ou telephonique.',
    },
    {
      title: 'Offre site web',
      description:
        'Le filtre sans site web permet d isoler les commerces qui peuvent avoir besoin d une creation ou d une refonte.',
    },
    {
      title: 'Campagne email',
      description:
        'Quand des emails publics sont trouves, tu peux envoyer une campagne HTML directement depuis la plateforme avec ton SMTP.',
    },
  ];

  protected readonly quickGuide: GuideCard[] = [
    {
      title: '1. Saisir la bonne zone',
      description:
        'Une recherche tres precise donne souvent des resultats plus exploitables qu une zone trop large.',
    },
    {
      title: '2. Choisir le bon segment',
      description:
        'Selectionne le type de commerce qui correspond vraiment a ton offre pour eviter le bruit dans la liste.',
    },
    {
      title: '3. Exporter ou contacter',
      description:
        'Le fichier CSV te sert pour le suivi commercial, et la campagne email te permet de contacter directement les adresses trouvees.',
    },
  ];

  protected readonly optionDocs: GuideCard[] = [
    {
      title: 'Sans site web uniquement',
      description:
        'Cette option garde seulement les commerces qui n ont pas encore de site, ideale pour une offre digitale.',
    },
    {
      title: 'Contacts publics depuis les sites',
      description:
        'Si un site est detecte, la plateforme peut recuperer les emails, telephones et pages de contact visibles.',
    },
    {
      title: 'Analyse avancee des pages',
      description:
        'Cette option pousse l enrichissement plus loin pour trouver davantage d informations utiles quand les pages sont moins directes a reperer.',
    },
  ];

  protected readonly websiteStudioGuide: GuideCard[] = [
    {
      title: 'Nouveau repo a chaque generation',
      description:
        'Chaque site cree un nouveau projet GitHub public, pousse les fichiers et lance automatiquement le deploiement statique.',
    },
    {
      title: 'Assets personalises prioritaires',
      description:
        'Tes logos, photos produits, interieurs ou menus sont priorises par rapport aux visuels recupares depuis la fiche commerce, le site officiel et des images publiques trouvees en ligne.',
    },
    {
      title: 'Edition naturelle apres coup',
      description:
        'Apres generation, tu peux uploader d autres images puis demander a l IA de remplacer, ajouter ou reorganiser les visuels sans repartir de zero.',
    },
  ];

  protected readonly websiteEditIdeas = [
    'Remplace le hero par les nouvelles images uploades et garde la meme structure.',
    'Ajoute les nouvelles photos a la galerie sans changer la disposition des blocs.',
    'Utilise les images uploades pour remplacer les placeholders et rendre le site plus premium.',
    'Passe la palette sur un style luxe noir et or.',
    'Ajoute une section temoignages et rends la galerie plus dynamique.',
    'Fais une version plus minimaliste avec des animations plus discretes.',
  ];

  constructor() {
    this.syncLeadToggles();
    void this.auth.initialize();
    effect(() => {
      const user = this.auth.currentUser();
      if (user && user.role !== 'Admin' && this.workspaceView() !== 'prospection') {
        this.navigateWorkspace('prospection', undefined, true);
      }

      if (user && !user.mustChangePassword) {
        const allowedCodes = user.allowedCountries.map((country) => country.code);
        if (!allowedCodes.includes(this.leadForm.controls.countryCode.value)) {
          this.leadForm.controls.countryCode.setValue(allowedCodes[0] ?? user.countryCode);
        }
      }

      if (
        !user ||
        user.mustChangePassword ||
        this.workspaceView() !== 'prospection' ||
        this.loadedProjectUserId === user.id
      ) {
        return;
      }

      this.loadedProjectUserId = user.id;
      void this.loadOwnedWebsiteProjects();
    });
  }

  protected openAdminUsers(): void {
    if (this.auth.currentUser()?.role === 'Admin') {
      this.navigateWorkspace('admin-commercials');
    }
  }

  protected openAdminSites(commercialId?: string): void {
    if (this.auth.currentUser()?.role === 'Admin') {
      this.navigateWorkspace('admin-sites', commercialId);
    }
  }

  protected openProspection(): void {
    this.navigateWorkspace('prospection');
  }

  protected openAccountSettings(): void {
    this.accountSettingsOpen.set(true);
  }

  protected closeAccountSettings(): void {
    this.accountSettingsOpen.set(false);
  }

  protected async logout(): Promise<void> {
    if (this.leadLoading()) {
      this.stopSearch();
    } else {
      this.searchSubscription?.unsubscribe();
    }
    this.closeAccountSettings();
    this.closeEmailCampaignModal();
    this.closeWebsiteStudio();
    this.leadResponse.set(null);
    this.websiteProjects.set({});
    this.loadedProjectUserId = null;
    this.navigateWorkspace('prospection', undefined, true);
    await this.auth.logout();
  }

  @HostListener('window:popstate')
  protected handleBrowserNavigation(): void {
    this.workspaceView.set(this.workspaceFromLocation());
    this.adminCommercialFilter.set(this.commercialFilterFromLocation());
  }

  private searchSubscription: Subscription | null = null;
  private activeSearchSessionId: string | null = null;

  protected async searchLeads(): Promise<void> {
    this.searchSubscription?.unsubscribe();
    this.leadError.set('');
    this.leadErrorHint.set('');
    this.leadResponse.set(null);
    this.copiedPlaceId.set(null);
    this.campaignRecipients.set([]);
    this.emailCampaignResult.set(null);
    this.websiteProjectBusyPlaceId.set(null);
    this.websiteProjectBusyMode.set(null);
    this.websiteGenerationNotices.set({});
    this.closeEmailCampaignModal();
    this.closeWebsiteStudio();

    if (this.leadForm.invalid) {
      this.leadForm.markAllAsTouched();
      this.leadSearchState.set('error');
      this.leadError.set('Certains criteres de recherche sont incomplets ou invalides.');
      this.leadErrorHint.set('Verifie surtout la ville et le nombre maximum de resultats.');
      return;
    }

    const values = this.leadForm.getRawValue();
    const websiteFilter = values.websiteFilter;
    const extractEmailsFromSites = websiteFilter === 'without_website' ? false : values.extractEmailsFromSites;
    const useGemini = extractEmailsFromSites && values.useGeminiForEmailExtraction;
    const searchSessionId = crypto.randomUUID();
    this.activeSearchSessionId = searchSessionId;

    let currentResponse: LeadSearchResponse = {
      provider: 'open_data',
      query: values.locationQuery.trim(),
      businessType: values.businessType,
      websiteFilter: websiteFilter,
      extractEmailsFromSites,
      total: 0,
      existingResultsCount: 0,
      newResultsCount: 0,
      requestedNewResults: values.maxResults,
      withWebsiteCount: 0,
      withoutWebsiteCount: 0,
      emailCount: 0,
      items: []
    };

    try {
      this.leadLoading.set(true);
      this.leadSearchState.set('running');

      this.searchSubscription = this.leadFinderApi
        .searchLeadsStream({
          provider: 'open_data',
          countryCode: values.countryCode,
          locationQuery: values.locationQuery.trim(),
          businessType: values.businessType,
          websiteFilter,
          extractEmailsFromSites,
          useGeminiForEmailExtraction: useGemini,
          maxResults: values.maxResults,
          searchSessionId,
        })
        .subscribe({
          next: (message: LeadStreamMessage) => {
            if (message.type === 'summary' && message.summary) {
              currentResponse = {
                ...currentResponse,
                total: message.summary.total,
                existingResultsCount: message.summary.existingResultsCount,
                newResultsCount: message.summary.newResultsCount,
                withWebsiteCount: message.summary.withWebsiteCount,
                withoutWebsiteCount: message.summary.withoutWebsiteCount,
                emailCount: message.summary.emailCount,
              };
              this.leadResponse.set({ ...currentResponse });
            } else if (message.type === 'lead' && message.lead) {
              const lead = message.lead;
              const items = [...currentResponse.items];
              const duplicateIndex = items.findIndex((i) => i.placeId === lead.placeId);

              if (duplicateIndex >= 0) {
                items[duplicateIndex] = lead;
              } else {
                items.push(lead);
              }

              const withWebsiteCount = items.filter(item => item.hasWebsite).length;
              const withoutWebsiteCount = items.length - withWebsiteCount;
              const emailCount = items.reduce((acc, item) => acc + (item.emailAddresses?.length ?? 0), 0);

              currentResponse = {
                ...currentResponse,
                items,
                withWebsiteCount,
                withoutWebsiteCount,
                emailCount,
                total: items.length
              };
              this.leadResponse.set({ ...currentResponse });
            } else if (message.type === 'done' && message.summary) {
              currentResponse = {
                ...currentResponse,
                total: message.summary.total,
                existingResultsCount: message.summary.existingResultsCount,
                newResultsCount: message.summary.newResultsCount,
                withWebsiteCount: message.summary.withWebsiteCount,
                withoutWebsiteCount: message.summary.withoutWebsiteCount,
                emailCount: message.summary.emailCount,
                items: message.leads ?? currentResponse.items,
              };
              this.leadResponse.set({ ...currentResponse });
              this.leadLoading.set(false);
              this.leadSearchState.set('completed');
              this.activeSearchSessionId = null;
            } else if (message.type === 'error' && message.errorMessage) {
              this.activeSearchSessionId = null;
              this.presentLeadSearchError(message.errorMessage);
            }
          },
          error: (err) => {
            if (this.leadSearchState() !== 'stopped') {
              this.activeSearchSessionId = null;
              this.presentLeadSearchError(err);
            }
          },
          complete: () => {
            this.leadLoading.set(false);
            if (this.leadSearchState() === 'running') {
              this.leadSearchState.set('completed');
            }
            this.activeSearchSessionId = null;
          }
        });
    } catch (error) {
      this.activeSearchSessionId = null;
      this.presentLeadSearchError(error);
    }
  }

  protected stopSearch(): void {
    if (!this.leadLoading()) {
      return;
    }

    this.leadSearchState.set('stopped');
    this.leadLoading.set(false);
    this.leadError.set('');
    this.leadErrorHint.set('');
    const searchSessionId = this.activeSearchSessionId;
    this.activeSearchSessionId = null;
    if (searchSessionId) {
      void this.leadFinderApi.cancelLeadSearch(searchSessionId);
    }
    this.searchSubscription?.unsubscribe();
    this.searchSubscription = null;
  }

  protected dismissLeadError(): void {
    this.leadError.set('');
    this.leadErrorHint.set('');
    if (this.leadSearchState() === 'error') {
      this.leadSearchState.set(this.leadItems().length ? 'stopped' : 'idle');
    }
  }

  protected syncLeadToggles(): void {
    const websiteFilter = this.leadForm.controls.websiteFilter.value;
    const extractEmailsControl = this.leadForm.controls.extractEmailsFromSites;
    const useGeminiControl = this.leadForm.controls.useGeminiForEmailExtraction;

    if (websiteFilter === 'without_website') {
      extractEmailsControl.setValue(false);
      useGeminiControl.setValue(false);
      extractEmailsControl.disable({ emitEvent: false });
      useGeminiControl.disable({ emitEvent: false });
      return;
    }

    if (extractEmailsControl.disabled) {
      extractEmailsControl.enable({ emitEvent: false });
    }

    if (!extractEmailsControl.value) {
      useGeminiControl.setValue(false);
      useGeminiControl.disable({ emitEvent: false });
      return;
    }

    if (useGeminiControl.disabled) {
      useGeminiControl.enable({ emitEvent: false });
    }
  }

  protected resetLeadWorkspace(): void {
    if (this.leadLoading()) {
      this.stopSearch();
    } else {
      this.searchSubscription?.unsubscribe();
    }
    this.leadForm.reset({
      countryCode: this.auth.currentUser()?.allowedCountries[0]?.code ?? '',
      locationQuery: '',
      businessType: 'restaurant',
      maxResults: 10,
      websiteFilter: 'all',
      extractEmailsFromSites: true,
      useGeminiForEmailExtraction: true,
    });
    this.syncLeadToggles();
    this.leadError.set('');
    this.leadErrorHint.set('');
    this.leadSearchState.set('idle');
    this.leadResponse.set(null);
    this.copiedPlaceId.set(null);
    this.campaignRecipients.set([]);
    this.emailCampaignResult.set(null);
    this.websiteProjectBusyPlaceId.set(null);
    this.websiteProjectBusyMode.set(null);
    this.websiteGenerationNotices.set({});
    this.closeEmailCampaignModal();
    this.closeWebsiteStudio();
  }

  protected openEmailCampaignModal(): void {
    if (!this.campaignRecipients().length) {
      const autoRecipients = this.createCampaignRecipientsFromLeadItems();
      this.campaignRecipients.set(
        autoRecipients.length ? autoRecipients : [this.createManualCampaignRecipient()],
      );
    }

    this.emailCampaignOpen.set(true);
    this.emailCampaignError.set('');
    this.emailCampaignResult.set(null);
    this.seedEmailCampaignDefaults();
    this.renderComposerHtml(this.emailComposerHtml() || this.defaultCampaignBody);
  }

  protected closeEmailCampaignModal(): void {
    this.emailCampaignOpen.set(false);
    this.emailCampaignError.set('');
  }

  protected selectAllCampaignRecipients(): void {
    this.campaignRecipients.update((recipients) =>
      recipients.map((recipient) => ({ ...recipient, selected: true })),
    );
  }

  protected clearCampaignRecipients(): void {
    this.campaignRecipients.update((recipients) =>
      recipients.map((recipient) => ({ ...recipient, selected: false })),
    );
  }

  protected isCampaignRecipientSelected(key: string): boolean {
    return this.campaignRecipients().some((recipient) => recipient.key === key && recipient.selected);
  }

  protected toggleCampaignRecipient(key: string): void {
    this.campaignRecipients.update((recipients) =>
      recipients.map((recipient) =>
        recipient.key === key ? { ...recipient, selected: !recipient.selected } : recipient,
      ),
    );
  }

  protected addManualCampaignRecipient(): void {
    this.campaignRecipients.update((recipients) => [...recipients, this.createManualCampaignRecipient()]);
  }

  protected updateCampaignRecipient(
    key: string,
    field: 'businessName' | 'emailAddress',
    value: string,
  ): void {
    this.campaignRecipients.update((recipients) =>
      recipients.map((recipient) =>
        recipient.key === key ? { ...recipient, [field]: value } : recipient,
      ),
    );
  }

  protected removeCampaignRecipient(key: string): void {
    this.campaignRecipients.update((recipients) =>
      recipients.filter((recipient) => recipient.key !== key),
    );
  }

  protected moveCampaignRecipient(key: string, direction: -1 | 1): void {
    this.campaignRecipients.update((recipients) => {
      const index = recipients.findIndex((recipient) => recipient.key === key);
      if (index < 0) {
        return recipients;
      }

      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= recipients.length) {
        return recipients;
      }

      const nextRecipients = [...recipients];
      const [moved] = nextRecipients.splice(index, 1);
      nextRecipients.splice(targetIndex, 0, moved);
      return nextRecipients;
    });
  }

  protected handleComposerInput(event: Event): void {
    const element = event.target as HTMLDivElement;
    this.emailComposerHtml.set(element.innerHTML);
  }

  protected handleComposerHtmlInput(event: Event): void {
    const element = event.target as HTMLTextAreaElement;
    this.emailComposerHtml.set(element.value);
  }

  protected setComposerMode(mode: 'visual' | 'html'): void {
    if (this.emailComposerMode() === mode) {
      return;
    }

    const html = this.getComposerHtml();
    this.emailComposerMode.set(mode);

    if (mode === 'visual') {
      this.renderComposerHtml(html);
    }
  }

  protected applyComposerCommand(command: string, value?: string): void {
    if (this.emailComposerMode() !== 'visual') {
      return;
    }

    const editor = this.composerEditor()?.nativeElement;
    if (!editor || typeof document === 'undefined') {
      return;
    }

    editor.focus();
    document.execCommand(command, false, value);
    this.emailComposerHtml.set(editor.innerHTML);
  }

  protected applyComposerHeading(tagName: 'h2' | 'h3' | 'p'): void {
    this.applyComposerCommand('formatBlock', tagName);
  }

  protected insertComposerLink(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const url = window.prompt('Lien a inserer');
    if (!url?.trim()) {
      return;
    }

    this.applyComposerCommand('createLink', url.trim());
  }

  protected insertComposerImageUrl(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const url = window.prompt('URL de l image a inserer');
    if (!url?.trim()) {
      return;
    }

    const html = `<img src="${this.escapeHtmlAttribute(url.trim())}" alt="" style="max-width:100%;height:auto;display:block;margin:16px 0;" />`;
    this.insertHtmlIntoComposer(html);
  }

  protected openComposerImagePicker(): void {
    this.composerImageInput()?.nativeElement.click();
  }

  protected async handleComposerImageSelection(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      const html = `<img src="${dataUrl}" alt="${this.escapeHtmlAttribute(file.name)}" style="max-width:100%;height:auto;display:block;margin:16px 0;" />`;
      this.insertHtmlIntoComposer(html);
    } finally {
      input.value = '';
    }
  }

  protected clearComposerBody(): void {
    this.emailComposerHtml.set('');
    const editor = this.composerEditor()?.nativeElement;
    if (editor) {
      editor.innerHTML = '';
      if (this.emailComposerMode() === 'visual') {
        editor.focus();
      }
    }
  }

  protected autofillFromEmail(): void {
    const username = this.emailCampaignForm.controls.username.value.trim();
    const fromEmailControl = this.emailCampaignForm.controls.fromEmail;

    if (!fromEmailControl.value.trim() && username.includes('@')) {
      fromEmailControl.setValue(username);
    }
  }

  protected async sendEmailCampaign(): Promise<void> {
    this.emailCampaignError.set('');
    this.emailCampaignResult.set(null);

    const htmlBody = this.getComposerHtml();
    if (this.emailCampaignForm.invalid) {
      this.emailCampaignForm.markAllAsTouched();
      return;
    }

    if (!this.selectedCampaignRecipients().length) {
      this.emailCampaignError.set('Selectionne au moins un destinataire.');
      return;
    }

    if (!this.hasVisibleComposerContent(htmlBody)) {
      this.emailCampaignError.set('Ajoute le contenu du message avant l envoi.');
      return;
    }

    const selectedRecipients = this.selectedCampaignRecipients()
      .map((recipient) => ({
        ...recipient,
        businessName: recipient.businessName.trim(),
        emailAddress: recipient.emailAddress.trim(),
      }));

    const missingName = selectedRecipients.find((recipient) => !recipient.businessName);
    if (missingName) {
      this.emailCampaignError.set('Chaque destinataire selectionne doit avoir un nom de societe.');
      return;
    }

    const invalidEmail = selectedRecipients.find(
      (recipient) => !this.isValidEmailAddress(recipient.emailAddress),
    );
    if (invalidEmail) {
      this.emailCampaignError.set(`Email invalide dans la liste: ${invalidEmail.emailAddress || 'vide'}`);
      return;
    }

    const formValues = this.emailCampaignForm.getRawValue();
    const payload: EmailCampaignSendRequest = {
      smtp: {
        host: formValues.host.trim(),
        port: formValues.port,
        secureMode: formValues.secureMode,
        username: formValues.username.trim(),
        password: formValues.password,
        fromName: formValues.fromName.trim(),
        fromEmail: formValues.fromEmail.trim(),
      },
      subject: formValues.subject.trim(),
      htmlBody,
      recipients: selectedRecipients.map((recipient) => ({
        leadId: recipient.placeId,
        businessName: recipient.businessName,
        emailAddress: recipient.emailAddress,
        websiteUri: recipient.websiteUri ?? null,
      })),
    };

    try {
      this.emailCampaignLoading.set(true);

      const response = await firstValueFrom(this.emailCampaignApi.sendCampaign(payload));
      this.emailCampaignResult.set(response);
    } catch (error) {
      this.emailCampaignError.set(this.resolveErrorMessage(error));
    } finally {
      this.emailCampaignLoading.set(false);
    }
  }

  protected formatRating(item: LeadSearchResultItem): string {
    if (item.rating == null) {
      return 'N/A';
    }

    return `${item.rating.toFixed(1)} / 5`;
  }

  protected formatExtractionSource(source: string): string {
    switch (source) {
      case 'directory':
        return 'Fiche commerce';
      case 'regex':
        return 'Analyse automatique du site';
      case 'gemini':
        return 'Analyse avancee du site';
      default:
        return 'Aucun contact detecte';
    }
  }

  protected formatWebsiteFilter(filter: string): string {
    switch (filter) {
      case 'without_website':
        return 'Sans site web uniquement';
      case 'with_website':
        return 'Avec site web uniquement';
      default:
        return 'Tous les commerces';
    }
  }

  protected formatBusinessStatus(status: string | null | undefined): string {
    switch ((status ?? '').trim().toUpperCase()) {
      case 'OPERATIONAL':
        return 'Actif';
      case 'CLOSED_TEMPORARILY':
        return 'Ferme temporairement';
      case 'CLOSED_PERMANENTLY':
        return 'Ferme';
      default:
        return status?.trim() || 'N/A';
    }
  }

  protected leadOpportunityText(item: LeadSearchResultItem): string {
    if (!item.hasWebsite) {
      return 'Besoin digital visible';
    }

    if (
      item.emailAddresses.length ||
      item.contactPhoneNumbers.length ||
      item.contactPageUris.length
    ) {
      return 'Prospect pret a contacter';
    }

    return 'Prospect a enrichir';
  }

  protected leadOpportunityTone(item: LeadSearchResultItem): string {
    if (!item.hasWebsite) {
      return 'amber';
    }

    if (
      item.emailAddresses.length ||
      item.contactPhoneNumbers.length ||
      item.contactPageUris.length
    ) {
      return 'green';
    }

    return 'violet';
  }

  protected hasExtractedContacts(item: LeadSearchResultItem): boolean {
    return (
      item.emailAddresses.length > 0 ||
      item.contactPhoneNumbers.length > 0 ||
      item.contactPageUris.length > 0
    );
  }

  protected primaryPhone(item: LeadSearchResultItem): string | null {
    const directPhone = item.phoneNumber?.trim();
    if (directPhone) {
      return directPhone;
    }

    const extractedPhone = item.contactPhoneNumbers.find((phone) => phone.trim().length > 0);
    return extractedPhone?.trim() ?? null;
  }

  protected trackLead(_: number, item: LeadSearchResultItem): string {
    return item.placeId;
  }

  protected trackCampaignRecipient(_: number, item: CampaignRecipientOption): string {
    return item.key;
  }

  protected async copyEmails(item: LeadSearchResultItem): Promise<void> {
    if (!item.emailAddresses.length || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(item.emailAddresses.join(', '));
    this.copiedPlaceId.set(item.placeId);

    if (this.copyResetHandle) {
      clearTimeout(this.copyResetHandle);
    }

    this.copyResetHandle = setTimeout(() => {
      this.copiedPlaceId.set(null);
      this.copyResetHandle = undefined;
    }, 1800);
  }

  protected isGeneratingWebsite(placeId: string): boolean {
    return (
      this.websiteProjectBusyPlaceId() === placeId &&
      this.websiteProjectBusyMode() === 'generate'
    );
  }

  protected isEditingWebsite(placeId: string): boolean {
    return (
      this.websiteProjectBusyPlaceId() === placeId &&
      this.websiteProjectBusyMode() === 'edit'
    );
  }

  protected websiteGenerationMessage(placeId: string): WebsiteGenerationNotice | null {
    return this.websiteGenerationNotices()[placeId] ?? null;
  }

  protected websiteProjectsForPlace(placeId: string): WebsiteProjectResponse[] {
    return this.websiteProjects()[placeId] ?? [];
  }

  protected latestWebsiteProject(placeId: string): WebsiteProjectResponse | null {
    return this.websiteProjectsForPlace(placeId)[0] ?? null;
  }

  protected websiteProjectCount(placeId: string): number {
    return this.websiteProjectsForPlace(placeId).length;
  }

  protected formatWebsiteProjectDate(value: string): string {
    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? value : this.projectDateFormatter.format(parsedDate);
  }

  protected openWebsiteStudio(item: LeadSearchResultItem, mode: WebsiteStudioMode): void {
    this.websiteStudioItem.set(item);
    this.websiteStudioMode.set(mode);
    this.websiteStudioOpen.set(true);
    this.websiteStudioSelectedProjectId.set(this.latestWebsiteProject(item.placeId)?.projectId ?? null);
    this.websiteStudioLogoFile.set(null);
    this.websiteStudioImageFiles.set([]);
    this.websiteStudioEditPrompt.set('');
  }

  protected closeWebsiteStudio(): void {
    this.websiteStudioOpen.set(false);
    this.websiteStudioItem.set(null);
    this.websiteStudioSelectedProjectId.set(null);
    this.websiteStudioLogoFile.set(null);
    this.websiteStudioImageFiles.set([]);
    this.websiteStudioEditPrompt.set('');
    this.websiteStudioMode.set('generate');
  }

  protected setWebsiteStudioMode(mode: WebsiteStudioMode): void {
    this.websiteStudioMode.set(mode);
  }

  protected selectWebsiteProject(projectId: string): void {
    this.websiteStudioSelectedProjectId.set(projectId);
    this.websiteStudioMode.set('edit');
  }

  protected useWebsiteEditIdea(idea: string): void {
    this.websiteStudioMode.set('edit');
    this.websiteStudioEditPrompt.set(idea);
  }

  protected updateWebsiteEditPrompt(value: string): void {
    this.websiteStudioEditPrompt.set(value);
  }

  protected handleWebsiteLogoSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.websiteStudioLogoFile.set(input.files?.[0] ?? null);
    input.value = '';
  }

  protected handleWebsiteImageSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) {
      return;
    }

    this.websiteStudioImageFiles.update((currentFiles) => {
      const nextFiles = [...currentFiles];

      for (const file of files) {
        const alreadyIncluded = nextFiles.some(
          (currentFile) =>
            currentFile.name === file.name &&
            currentFile.size === file.size &&
            currentFile.lastModified === file.lastModified,
        );

        if (!alreadyIncluded) {
          nextFiles.push(file);
        }
      }

      return nextFiles;
    });

    input.value = '';
  }

  protected clearWebsiteLogo(): void {
    this.websiteStudioLogoFile.set(null);
  }

  protected removeWebsiteImage(index: number): void {
    this.websiteStudioImageFiles.update((currentFiles) =>
      currentFiles.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  protected clearWebsiteImages(): void {
    this.websiteStudioImageFiles.set([]);
  }

  protected async submitWebsiteGenerationFromStudio(): Promise<void> {
    const item = this.websiteStudioItem();
    if (!item || item.hasWebsite) {
      return;
    }

    this.clearWebsiteNotice(item.placeId);
    this.websiteProjectBusyPlaceId.set(item.placeId);
    this.websiteProjectBusyMode.set('generate');

    try {
      const project = await firstValueFrom(
        this.leadFinderApi.generateWebsite(this.buildWebsiteGenerationRequest(item), {
          uploadedImages: this.websiteStudioImageFiles(),
          uploadedLogo: this.websiteStudioLogoFile(),
        }),
      );

      this.prependWebsiteProject(item.placeId, project);
      this.websiteStudioSelectedProjectId.set(project.projectId);
      this.websiteStudioMode.set('edit');
      this.websiteStudioEditPrompt.set('');
      this.clearWebsiteLogo();
      this.clearWebsiteImages();
      this.setWebsiteNotice(item.placeId, {
        tone: 'success',
        text: `Site genere, publie et verifie. ${project.templateName} - ${project.modelUsed}.`,
      });
    } catch (error) {
      this.setWebsiteNotice(item.placeId, {
        tone: 'error',
        text: this.resolveErrorMessage(error),
      });
    } finally {
      this.websiteProjectBusyPlaceId.set(null);
      this.websiteProjectBusyMode.set(null);
    }
  }

  protected async submitWebsiteEditFromStudio(): Promise<void> {
    const item = this.websiteStudioItem();
    const activeProject = this.websiteStudioActiveProject();
    const prompt = this.buildWebsiteEditPrompt();

    if (!item || !activeProject) {
      return;
    }

    if (!prompt) {
      this.setWebsiteNotice(item.placeId, {
        tone: 'error',
        text: 'Ajoute une instruction claire avant de lancer Edit with AI.',
      });
      return;
    }

    this.clearWebsiteNotice(item.placeId);
    this.websiteProjectBusyPlaceId.set(item.placeId);
    this.websiteProjectBusyMode.set('edit');

    try {
      const project = await firstValueFrom(
        this.leadFinderApi.editWebsite(
          activeProject.projectId,
          { prompt },
          {
            uploadedImages: this.websiteStudioImageFiles(),
            uploadedLogo: this.websiteStudioLogoFile(),
          },
        ),
      );

      this.replaceWebsiteProject(item.placeId, project);
      this.websiteStudioSelectedProjectId.set(project.projectId);
      this.websiteStudioEditPrompt.set('');
      this.clearWebsiteLogo();
      this.clearWebsiteImages();
      this.setWebsiteNotice(item.placeId, {
        tone: 'success',
        text: project.changeSummary?.trim() || 'Site mis a jour, redeploye et revalide automatiquement.',
      });
    } catch (error) {
      this.setWebsiteNotice(item.placeId, {
        tone: 'error',
        text: this.resolveErrorMessage(error),
      });
    } finally {
      this.websiteProjectBusyPlaceId.set(null);
      this.websiteProjectBusyMode.set(null);
    }
  }

  private buildWebsiteEditPrompt(): string {
    const rawPrompt = this.websiteStudioEditPrompt().trim();
    if (rawPrompt) {
      return rawPrompt;
    }

    const hasLogo = !!this.websiteStudioLogoFile();
    const imageCount = this.websiteStudioImageFiles().length;

    if (hasLogo && imageCount > 0) {
      return 'Utilise le logo et les nouvelles images uploades pour mettre a jour le site, remplace les visuels existants si necessaire et garde la meme structure premium.';
    }

    if (hasLogo) {
      return 'Remplace le logo actuel par le logo uploade et garde le reste du site identique.';
    }

    if (imageCount > 1) {
      return 'Remplace les visuels existants par les nouvelles images uploades, garde le meme layout et integre-les proprement dans le hero et la galerie.';
    }

    if (imageCount === 1) {
      return 'Remplace l image principale actuelle par la nouvelle image uploadee et garde la meme structure du site.';
    }

    return '';
  }

  protected trackWebsiteProject(_: number, project: WebsiteProjectResponse): string {
    return project.projectId;
  }

  protected downloadResultsCsv(type: 'full' | 'addresses' | 'phones' = 'full'): void {
    const response = this.leadResponse();
    if (!response?.items.length || typeof document === 'undefined') {
      return;
    }

    let headers: string[];
    let getRowCells: (item: LeadSearchResultItem) => string[];
    let fileSuffix: string;

    if (type === 'addresses') {
      headers = ['Nom', 'Adresse'];
      getRowCells = (item) => [
        item.name,
        item.formattedAddress ?? '',
      ];
      fileSuffix = '_adresses';
    } else if (type === 'phones') {
      headers = ['Nom', 'Telephone', 'Autres Telephones'];
      getRowCells = (item) => [
        item.name,
        this.primaryPhone(item) ?? '',
        item.contactPhoneNumbers.join(' | '),
      ];
      fileSuffix = '_telephones';
    } else {
      headers = [
        'Nom',
        'Categorie',
        'Adresse',
        'Telephone fiche',
        'Site web',
        'Lien carte',
        'A un site',
        'Statut',
        'Origine des contacts',
        'Emails',
        'Telephones site',
        'Pages contact',
        'Opportunite',
      ];
      getRowCells = (item) => [
        item.name,
        item.businessLabel,
        item.formattedAddress ?? '',
        this.primaryPhone(item) ?? '',
        item.websiteUri ?? '',
        item.googleMapsUri ?? '',
        item.hasWebsite ? 'Oui' : 'Non',
        this.formatBusinessStatus(item.businessStatus),
        this.formatExtractionSource(item.emailExtractionSource),
        item.emailAddresses.join(' | '),
        item.contactPhoneNumbers.join(' | '),
        item.contactPageUris.join(' | '),
        this.leadOpportunityText(item),
      ];
      fileSuffix = '';
    }

    const rows = [
      headers,
      ...response.items.map(getRowCells),
    ];

    const csvContent = rows
      .map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(';'))
      .join('\r\n');

    const blob = new Blob(['\ufeff', csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const baseName = this.buildCsvFileName(response.query, this.activeBusinessType().label);
    const downloadName = fileSuffix
      ? baseName.replace(/\.csv$/, `${fileSuffix}.csv`)
      : baseName;

    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  private seedEmailCampaignDefaults(): void {
    const query = this.leadResponse()?.query ?? 'votre zone';
    const businessType = this.activeBusinessType().label.toLowerCase();
    const username = this.emailCampaignForm.controls.username.value.trim();
    const fromEmailControl = this.emailCampaignForm.controls.fromEmail;
    const subjectControl = this.emailCampaignForm.controls.subject;

    if (!subjectControl.value.trim()) {
      subjectControl.setValue(`Proposition pour {{recipientName}} - ${businessType} - ${query}`);
    }

    if (!fromEmailControl.value.trim() && username.includes('@')) {
      fromEmailControl.setValue(username);
    }

    if (!this.emailComposerHtml()) {
      this.emailComposerHtml.set(this.defaultCampaignBody);
    }
  }

  private createCampaignRecipientsFromLeadItems(): CampaignRecipientOption[] {
    const recipients: CampaignRecipientOption[] = [];
    const seen = new Set<string>();

    for (const item of this.leadItems()) {
      for (const email of item.emailAddresses) {
        const trimmedEmail = email.trim();
        const normalizedEmail = trimmedEmail.toLowerCase();

        if (!normalizedEmail || seen.has(normalizedEmail)) {
          continue;
        }

        seen.add(normalizedEmail);
        recipients.push({
          key: this.nextCampaignRecipientKey('lead'),
          placeId: item.placeId,
          businessName: item.name,
          businessLabel: item.businessLabel,
          emailAddress: trimmedEmail,
          websiteUri: item.websiteUri,
          selected: true,
          isManual: false,
        });
      }
    }

    return recipients;
  }

  private createManualCampaignRecipient(): CampaignRecipientOption {
    const key = this.nextCampaignRecipientKey('manual');
    return {
      key,
      placeId: key,
      businessName: '',
      businessLabel: 'Ajout manuel',
      emailAddress: '',
      websiteUri: null,
      selected: true,
      isManual: true,
    };
  }

  private nextCampaignRecipientKey(prefix: string): string {
    this.campaignRecipientSequence += 1;
    return `${prefix}-${this.campaignRecipientSequence}`;
  }

  private renderComposerHtml(html: string): void {
    this.emailComposerHtml.set(html);

    setTimeout(() => {
      const editor = this.composerEditor()?.nativeElement;
      if (!editor) {
        return;
      }

      editor.innerHTML = html;
    }, 0);
  }

  private getComposerHtml(): string {
    if (this.emailComposerMode() === 'html') {
      return this.emailComposerHtml();
    }

    const editor = this.composerEditor()?.nativeElement;
    const html = editor?.innerHTML ?? this.emailComposerHtml();
    this.emailComposerHtml.set(html);
    return html;
  }

  private hasVisibleComposerContent(html: string): boolean {
    const content = html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return content.length > 0;
  }

  private insertHtmlIntoComposer(html: string): void {
    if (this.emailComposerMode() === 'html') {
      const separator = this.emailComposerHtml().trim() ? '\n' : '';
      this.emailComposerHtml.update((current) => `${current}${separator}${html}`);
      return;
    }

    const editor = this.composerEditor()?.nativeElement;
    if (!editor || typeof document === 'undefined') {
      return;
    }

    editor.focus();
    document.execCommand('insertHTML', false, html);
    this.emailComposerHtml.set(editor.innerHTML);
  }

  private async readFileAsDataUrl(file: File): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Lecture image impossible.'));
      reader.readAsDataURL(file);
    });
  }

  private escapeHtmlAttribute(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  private isValidEmailAddress(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  private escapeCsvCell(value: unknown): string {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }

  private buildCsvFileName(query: string, businessType: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return `prospects-${this.slugify(query)}-${this.slugify(businessType)}-${date}.csv`;
  }

  private slugify(value: string): string {
    const slug = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'campagne';
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error === 'string' && error.error.trim()) {
        return error.error;
      }

      if (error.error && typeof error.error.error === 'string' && error.error.error.trim()) {
        return error.error.error;
      }

      return error.message || 'La requete a echoue.';
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'Erreur inconnue';
  }

  private presentLeadSearchError(error: unknown): void {
    const rawMessage = typeof error === 'string' ? error : this.resolveErrorMessage(error);
    const normalized = rawMessage.toLowerCase();
    let message = rawMessage;
    let hint = 'Verifie les criteres puis relance la recherche. Si le probleme continue, reessaie dans quelques minutes.';

    if (normalized.includes('no location found') || normalized.includes('zone') && normalized.includes('introuvable')) {
      message = `La zone demandee est introuvable dans ${this.activeSearchCountry()?.name ?? 'le pays autorise'}.`;
      hint = 'Essaie uniquement le nom de la ville, ajoute le code postal ou corrige l orthographe.';
    } else if (normalized.includes('overpass') || normalized.includes('configured overpass')) {
      message = 'Les sources cartographiques sont temporairement indisponibles.';
      hint = 'Tes resultats deja recus sont conserves. Attends quelques instants puis clique sur Continuer.';
    } else if (
      normalized.includes('failed to fetch') ||
      normalized.includes('network') ||
      normalized.includes('api is running')
    ) {
      message = 'La connexion avec le serveur de recherche a ete interrompue.';
      hint = 'Verifie que le backend est demarre et que ta connexion internet fonctionne.';
    } else if (normalized.includes('401') || normalized.includes('identifiants')) {
      message = 'Ta session a expire. Reconnecte-toi pour continuer.';
      hint = 'Recharge la page puis saisis de nouveau tes identifiants.';
    } else if (normalized.includes('403')) {
      message = 'Ton compte doit etre reactualise avant de poursuivre.';
      hint = 'Recharge la page. Un nouveau mot de passe peut avoir ete demande par l administrateur.';
    } else if (normalized.includes('google places api key')) {
      message = 'La cle Google Places n est pas configuree sur le serveur.';
      hint = 'Utilise la source OpenStreetMap ou demande a l administrateur de configurer la cle.';
    } else if (normalized.includes('http 429') || normalized.includes('too many')) {
      message = 'Trop de recherches ont ete lancees en peu de temps.';
      hint = 'Attends une minute avant de continuer.';
    } else if (normalized.includes('reponse') && normalized.includes('illisible')) {
      message = 'La reponse du serveur est incomplete.';
      hint = 'Les prospects deja recus restent affiches. Clique sur Continuer pour reprendre.';
    }

    this.leadError.set(message);
    this.leadErrorHint.set(hint);
    this.leadLoading.set(false);
    this.leadSearchState.set('error');
  }

  private buildWebsiteGenerationRequest(item: LeadSearchResultItem): WebsiteGenerationRequest {
    return {
      placeId: item.placeId,
      businessName: item.name,
      businessCategory: item.businessLabel,
      primaryType: item.primaryType ?? null,
      description: null,
      address: item.formattedAddress ?? null,
      phoneNumber: this.primaryPhone(item),
      whatsappNumber: this.primaryPhone(item),
      websiteUri: item.websiteUri ?? null,
      googleMapsUri: item.googleMapsUri ?? null,
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      rating: item.rating ?? null,
      reviewCount: item.userRatingCount ?? null,
      reviewsSummary: this.buildLeadReviewSummary(item),
      emailAddresses: [...item.emailAddresses],
      openingHours: [],
      services: [],
      features: [],
      photoUris: [],
      logoUri: null,
      socialLinks: {},
      languages: ['fr', 'en', 'ar'],
    };
  }

  private async loadOwnedWebsiteProjects(): Promise<void> {
    try {
      const projects = await firstValueFrom(this.leadFinderApi.listWebsiteProjects());
      const grouped: Record<string, WebsiteProjectResponse[]> = {};

      for (const project of projects) {
        const placeId = project.placeId?.trim();
        if (!placeId) {
          continue;
        }

        grouped[placeId] = [...(grouped[placeId] ?? []), project];
      }

      for (const placeId of Object.keys(grouped)) {
        grouped[placeId].sort(
          (first, second) =>
            new Date(second.updatedUtc).getTime() - new Date(first.updatedUtc).getTime(),
        );
      }

      this.websiteProjects.set(grouped);
    } catch {
      // Project history is helpful but must not block the prospecting workspace.
    }
  }

  private buildLeadReviewSummary(item: LeadSearchResultItem): string | null {
    if (item.rating == null) {
      return null;
    }

    const reviewCount = item.userRatingCount ?? 0;
    return `${item.name} affiche actuellement une note de ${item.rating.toFixed(1)}/5 sur ${reviewCount} avis publics.`;
  }

  private clearWebsiteNotice(placeId: string): void {
    this.websiteGenerationNotices.update((notices) => {
      const nextNotices = { ...notices };
      delete nextNotices[placeId];
      return nextNotices;
    });
  }

  private setWebsiteNotice(placeId: string, notice: WebsiteGenerationNotice): void {
    this.websiteGenerationNotices.update((notices) => ({
      ...notices,
      [placeId]: notice,
    }));
  }

  private prependWebsiteProject(placeId: string, project: WebsiteProjectResponse): void {
    this.websiteProjects.update((projects) => {
      const currentProjects = projects[placeId] ?? [];
      return {
        ...projects,
        [placeId]: [
          project,
          ...currentProjects.filter(
            (currentProject) => currentProject.projectId !== project.projectId,
          ),
        ],
      };
    });
  }

  private replaceWebsiteProject(placeId: string, project: WebsiteProjectResponse): void {
    this.websiteProjects.update((projects) => {
      const currentProjects = projects[placeId] ?? [];
      const hasMatch = currentProjects.some(
        (currentProject) => currentProject.projectId === project.projectId,
      );

      return {
        ...projects,
        [placeId]: hasMatch
          ? currentProjects.map((currentProject) =>
              currentProject.projectId === project.projectId ? project : currentProject,
            )
          : [project, ...currentProjects],
      };
    });
  }

  private navigateWorkspace(
    view: AppWorkspaceView,
    commercialId?: string,
    replaceHistory = false,
  ): void {
    if (view !== 'prospection' && this.auth.currentUser()?.role !== 'Admin') {
      return;
    }

    if (view !== 'prospection' && this.leadLoading()) {
      this.stopSearch();
    }
    this.closeEmailCampaignModal();
    this.closeWebsiteStudio();

    this.workspaceView.set(view);
    this.adminCommercialFilter.set(view === 'admin-sites' ? commercialId ?? '' : '');

    const path =
      view === 'admin-commercials'
        ? '/admin/commerciaux'
        : view === 'admin-sites'
          ? '/admin/sites'
          : '/prospection';
    const url = commercialId && view === 'admin-sites'
      ? `${path}?commercial=${encodeURIComponent(commercialId)}`
      : path;

    if (replaceHistory) {
      window.history.replaceState({}, '', url);
    } else if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.pushState({}, '', url);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private workspaceFromLocation(): AppWorkspaceView {
    const path = window.location.pathname.toLocaleLowerCase('fr');
    if (path.startsWith('/admin/commerciaux')) {
      return 'admin-commercials';
    }
    if (path.startsWith('/admin/sites')) {
      return 'admin-sites';
    }
    return 'prospection';
  }

  private commercialFilterFromLocation(): string {
    return new URLSearchParams(window.location.search).get('commercial') ?? '';
  }
}
