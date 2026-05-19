import { computed, inject } from "@angular/core";
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals";
import { ReleaseApiClient } from "./release-api.client";
import type { DigitalRelease, ProviderFilter, ReleaseWeekResponse, ReleaseWeekStatus, UserSettings } from "./release.models";
import {
  addWeeks,
  buildReleaseSections,
  cacheLabel,
  canHideShow,
  collectAddableProviderFilters,
  collectHiddenShowFilters,
  collectProviderFilters,
  DEFAULT_SELECTED_PROVIDERS,
  formatWeekRange,
  providerDisplayName,
  providerKeyFromName,
  showKey,
  startOfIsoWeek,
  weekEndFromStart,
} from "./release-week.utils";

type ReleaseWeekState = {
  weekStart: string;
  response: ReleaseWeekResponse | null;
  status: ReleaseWeekStatus;
  settingsStatus: "idle" | "loading" | "ready" | "error";
  error: string | null;
  selectedProviderKeys: string[];
  hiddenShowKeys: string[];
  knownProviders: ProviderFilter[];
  favoriteShowKeys: string[];
  showOnlyFavorites: boolean;
  showInternational: boolean;
  showDubbed: boolean;
};

const initialWeekStart = startOfIsoWeek();

export const ReleaseWeekStore = signalStore(
  { providedIn: "root" },
  withState<ReleaseWeekState>({
    weekStart: initialWeekStart,
    response: null,
    status: "idle",
    settingsStatus: "idle",
    error: null,
    selectedProviderKeys: DEFAULT_SELECTED_PROVIDERS.map((provider) => provider.key),
    hiddenShowKeys: [],
    knownProviders: DEFAULT_SELECTED_PROVIDERS,
    favoriteShowKeys: [],
    showOnlyFavorites: false,
    showInternational: false,
    showDubbed: false,
  }),
  withComputed((store) => ({
    selectedProviderKeySet: computed(() => new Set(store.selectedProviderKeys())),
    favoriteShowKeySet: computed(() => new Set(store.favoriteShowKeys())),
    sections: computed(() =>
      buildReleaseSections(
        store.response(),
        new Set(store.selectedProviderKeys()),
        new Set(store.hiddenShowKeys()),
        {
          showOnlyFavorites: store.showOnlyFavorites(),
          favoriteShowKeys: new Set(store.favoriteShowKeys()),
          showInternational: store.showInternational(),
          showDubbed: store.showDubbed(),
        },
      ),
    ),
    providerFilters: computed(() =>
      collectProviderFilters(store.response(), new Set(store.selectedProviderKeys()), store.knownProviders(), {
        hiddenShowKeys: new Set(store.hiddenShowKeys()),
        showOnlyFavorites: store.showOnlyFavorites(),
        favoriteShowKeys: new Set(store.favoriteShowKeys()),
        showInternational: store.showInternational(),
        showDubbed: store.showDubbed(),
      }),
    ),
    selectedProviderFilters: computed(() =>
      orderedSelectedProviders(
        collectProviderFilters(store.response(), new Set(store.selectedProviderKeys()), store.knownProviders(), {
          hiddenShowKeys: new Set(store.hiddenShowKeys()),
          showOnlyFavorites: store.showOnlyFavorites(),
          favoriteShowKeys: new Set(store.favoriteShowKeys()),
          showInternational: store.showInternational(),
          showDubbed: store.showDubbed(),
        }),
        store.selectedProviderKeys(),
      ),
    ),
    addableProviderFilters: computed(() =>
      collectAddableProviderFilters(
        collectProviderFilters(store.response(), new Set(store.selectedProviderKeys()), store.knownProviders(), {
          hiddenShowKeys: new Set(store.hiddenShowKeys()),
          showOnlyFavorites: store.showOnlyFavorites(),
          favoriteShowKeys: new Set(store.favoriteShowKeys()),
          showInternational: store.showInternational(),
          showDubbed: store.showDubbed(),
        }),
      ),
    ),
    hiddenShowFilters: computed(() =>
      collectHiddenShowFilters(store.response(), new Set(store.hiddenShowKeys())),
    ),
    weekRange: computed(() => {
      const response = store.response();
      if (!response || response.weekStart !== store.weekStart()) {
        return formatWeekRange(store.weekStart(), weekEndFromStart(store.weekStart()));
      }
      return formatWeekRange(response.weekStart, response.weekEnd);
    }),
    cacheMessage: computed(() =>
      cacheLabel(store.status(), store.error(), store.response()?.cache ?? null),
    ),
  })),
  withMethods((store, api = inject(ReleaseApiClient)) => {
    function currentSettings(): UserSettings {
      return {
        hiddenProviders: [],
        selectedProviders: selectedProviderPreferences(store.knownProviders(), store.selectedProviderKeys()),
        hiddenShowKeys: unique(store.hiddenShowKeys()),
        showOnlyFavorites: store.showOnlyFavorites(),
        showInternational: store.showInternational(),
        showDubbed: store.showDubbed(),
      };
    }

    async function persistSettings() {
      try {
        const settings = await api.updateSettings(currentSettings());
        patchSettings(settings);
      } catch (error) {
        patchState(store, {
          error: error instanceof Error ? error.message : "Settings could not be saved",
        });
      }
    }

    function patchSettings(settings: UserSettings) {
      const selectedProviders = settings.selectedProviders;
      const knownProviders = mergeKnownProviders(
        DEFAULT_SELECTED_PROVIDERS,
        mergeKnownProviders(store.knownProviders(), selectedProviders),
      );
      patchState(store, {
        selectedProviderKeys: unique(selectedProviders.map((provider) => providerKeyFromName(provider.name))),
        hiddenShowKeys: unique(settings.hiddenShowKeys),
        knownProviders,
        showOnlyFavorites: settings.showOnlyFavorites === true,
        showInternational: settings.showInternational === true,
        showDubbed: settings.showDubbed === true,
        settingsStatus: "ready",
      });
    }

    async function loadUserData() {
      patchState(store, { settingsStatus: "loading" });
      const [settings, favorites] = await Promise.all([
        api.getSettings(),
        api.getFavorites(),
      ]);
      patchSettings(settings);
      patchState(store, {
        favoriteShowKeys: favorites.map((favorite) => favorite.showKey),
        settingsStatus: "ready",
      });
    }

    async function load(weekStart: string, refresh: boolean) {
      patchState(store, {
        weekStart,
        status: refresh ? "refreshing" : "loading",
        error: null,
      });

      try {
        const [response] = await Promise.all([
          refresh ? api.refreshWeek(weekStart) : api.getWeek(weekStart),
          loadUserData(),
        ]);

        const knownProviders = mergeKnownProviders(
          store.knownProviders(),
          collectProviderFilters(response, new Set(store.selectedProviderKeys()), store.knownProviders()),
        );

        patchState(store, {
          weekStart: response.weekStart,
          response,
          status: "ready",
          error: null,
          knownProviders,
        });
      } catch (error) {
        patchState(store, {
          status: "error",
          settingsStatus: store.settingsStatus() === "loading" ? "error" : store.settingsStatus(),
          error: error instanceof Error ? error.message : "Release data is unavailable",
        });
      }
    }

    return {
      loadWeek: (weekStart: string = store.weekStart()) => load(weekStart, false),
      refresh: () => load(store.weekStart(), true),
      previousWeek: () => load(addWeeks(store.weekStart(), -1), false),
      nextWeek: () => load(addWeeks(store.weekStart(), 1), false),
      addSelectedProvider: (key: string) => {
        if (!key || store.selectedProviderKeys().includes(key)) return;
        const provider = store.providerFilters().find((candidate) => candidate.key === key);
        if (!provider) return;
        const knownProviders = mergeKnownProviders(store.knownProviders(), [provider]);
        patchState(store, {
          selectedProviderKeys: unique([...store.selectedProviderKeys(), key]),
          knownProviders,
        });
        void persistSettings();
      },
      removeSelectedProvider: (key: string) => {
        patchState(store, {
          selectedProviderKeys: store.selectedProviderKeys().filter((candidate) => candidate !== key),
        });
        void persistSettings();
      },
      hideShow: (release: DigitalRelease) => {
        if (!canHideShow(release, new Set(store.favoriteShowKeys()))) return;
        const key = showKey(release);
        if (!key) return;
        patchState(store, { hiddenShowKeys: unique([...store.hiddenShowKeys(), key]) });
        void persistSettings();
      },
      clearHiddenShows: () => {
        patchState(store, { hiddenShowKeys: [] });
        void persistSettings();
      },
      restoreHiddenShow: (key: string) => {
        patchState(store, {
          hiddenShowKeys: store.hiddenShowKeys().filter((candidate) => candidate !== key),
        });
        void persistSettings();
      },
      setShowOnlyFavorites: (showOnlyFavorites: boolean) => {
        patchState(store, { showOnlyFavorites });
        void persistSettings();
      },
      setShowInternational: (showInternational: boolean) => {
        patchState(store, { showInternational });
        void persistSettings();
      },
      setShowDubbed: (showDubbed: boolean) => {
        patchState(store, { showDubbed });
        void persistSettings();
      },
      addFavorite: async (release: DigitalRelease) => {
        if (release.mediaType !== "tv") return;
        const favorite = await api.addFavorite(release.eventId);
        patchState(store, {
          favoriteShowKeys: unique([...store.favoriteShowKeys(), favorite.showKey]),
        });
      },
    };
  }),
);

function mergeKnownProviders(
  existing: ProviderFilter[],
  incoming: ProviderFilter[],
): ProviderFilter[] {
  const providers = new Map<string, ProviderFilter>();
  for (const provider of existing) providers.set(providerKeyFromName(provider.name), normalizeProvider(provider));
  for (const provider of incoming) providers.set(providerKeyFromName(provider.name), normalizeProvider(provider));
  return [...providers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeProvider(provider: ProviderFilter): ProviderFilter {
  return {
    key: providerKeyFromName(provider.name),
    name: providerDisplayName(provider.name),
    hidden: false,
    selected: provider.selected,
    count: provider.count,
    disabled: provider.disabled,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function orderedSelectedProviders(
  providers: ProviderFilter[],
  selectedProviderKeys: string[],
): ProviderFilter[] {
  const byKey = new Map(providers.map((provider) => [provider.key, provider]));
  return selectedProviderKeys
    .map((key) => byKey.get(key))
    .filter((provider): provider is ProviderFilter => Boolean(provider))
    .map((provider) => ({ ...provider, selected: true, hidden: false }));
}

function selectedProviderPreferences(
  knownProviders: ProviderFilter[],
  selectedProviderKeys: string[],
): ProviderFilter[] {
  const byKey = new Map(knownProviders.map((provider) => [provider.key, provider]));
  return selectedProviderKeys.map((key) => {
    const provider = byKey.get(key);
    return {
      key,
      name: providerDisplayName(provider?.name ?? key.replace(/^provider:/, "")),
      hidden: false,
      selected: true,
    };
  });
}
