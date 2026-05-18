import { computed, inject } from "@angular/core";
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals";
import { ReleaseApiClient } from "./release-api.client";
import type { DigitalRelease, ProviderFilter, ReleaseWeekResponse, ReleaseWeekStatus, UserSettings } from "./release.models";
import {
  addWeeks,
  buildReleaseSections,
  cacheLabel,
  collectProviderFilters,
  formatWeekRange,
  providerDisplayName,
  providerKeyFromName,
  releaseSources,
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
  hiddenProviderKeys: string[];
  hiddenShowKeys: string[];
  knownProviders: ProviderFilter[];
  focusedProviderKey: string | null;
  favoriteShowKeys: string[];
  showOnlyFavorites: boolean;
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
    hiddenProviderKeys: [],
    hiddenShowKeys: [],
    knownProviders: [],
    focusedProviderKey: null,
    favoriteShowKeys: [],
    showOnlyFavorites: false,
  }),
  withComputed((store) => ({
    hiddenProviderKeySet: computed(() => new Set(store.hiddenProviderKeys())),
    favoriteShowKeySet: computed(() => new Set(store.favoriteShowKeys())),
    sections: computed(() =>
      buildReleaseSections(
        store.response(),
        new Set(store.hiddenProviderKeys()),
        new Set(store.hiddenShowKeys()),
        store.focusedProviderKey(),
        {
          showOnlyFavorites: store.showOnlyFavorites(),
          favoriteShowKeys: new Set(store.favoriteShowKeys()),
        },
      ),
    ),
    providerFilters: computed(() =>
      collectProviderFilters(store.response(), new Set(store.hiddenProviderKeys()), store.knownProviders()),
    ),
    hiddenProviderFilters: computed(() =>
      collectProviderFilters(store.response(), new Set(store.hiddenProviderKeys()), store.knownProviders()).filter(
        (provider) => provider.hidden,
      ),
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
      const hiddenSet = new Set(store.hiddenProviderKeys());
      return {
        hiddenProviders: store.knownProviders().map((provider) => ({
          key: providerKeyFromName(provider.name),
          name: providerDisplayName(provider.name),
          hidden: hiddenSet.has(providerKeyFromName(provider.name)),
        })),
        hiddenShowKeys: unique(store.hiddenShowKeys()),
        showOnlyFavorites: store.showOnlyFavorites(),
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
      const knownProviders = mergeKnownProviders(store.knownProviders(), settings.hiddenProviders);
      patchState(store, {
        hiddenProviderKeys: unique(
          settings.hiddenProviders
            .filter((provider) => provider.hidden)
            .map((provider) => providerKeyFromName(provider.name)),
        ),
        hiddenShowKeys: unique(settings.hiddenShowKeys),
        knownProviders,
        showOnlyFavorites: settings.showOnlyFavorites,
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
          collectProviderFilters(response, new Set(store.hiddenProviderKeys()), store.knownProviders()),
        );

        patchState(store, {
          weekStart: response.weekStart,
          response,
          status: "ready",
          error: null,
          knownProviders,
        });
        void persistSettings();
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
      hideProvider: (release: DigitalRelease) => {
        const source = releaseSources(release)[0];
        const key = source.key;
        const hiddenProviderKeys = unique([...store.hiddenProviderKeys(), key]);
        const knownProviders = mergeKnownProviders(store.knownProviders(), [
          { key, name: source.name, hidden: true },
        ]);
        patchState(store, { hiddenProviderKeys, knownProviders });
        void persistSettings();
      },
      hideProviderKey: (key: string, name: string) => {
        const canonicalKey = providerKeyFromName(name);
        const hiddenProviderKeys = unique([...store.hiddenProviderKeys(), canonicalKey]);
        const knownProviders = mergeKnownProviders(store.knownProviders(), [
          { key: canonicalKey, name, hidden: true },
        ]);
        patchState(store, { hiddenProviderKeys, knownProviders });
        void persistSettings();
      },
      setProviderHidden: (key: string, hidden: boolean) => {
        const provider = store.knownProviders().find((candidate) => candidate.key === key);
        const canonicalKey = provider ? providerKeyFromName(provider.name) : key;
        const hiddenProviderKeys = hidden
          ? unique([...store.hiddenProviderKeys(), canonicalKey])
          : store.hiddenProviderKeys().filter((candidate) => candidate !== canonicalKey);
        const knownProviders = store.knownProviders().map((provider) =>
          provider.key === canonicalKey ? { ...provider, hidden } : provider,
        );
        patchState(store, { hiddenProviderKeys, knownProviders });
        void persistSettings();
      },
      setFocusedProvider: (key: string) => {
        const focusedProviderKey = key || null;
        const hiddenProviderKeys = focusedProviderKey
          ? store.hiddenProviderKeys().filter((candidate) => candidate !== focusedProviderKey)
          : store.hiddenProviderKeys();
        const knownProviders = store.knownProviders().map((provider) =>
          provider.key === focusedProviderKey ? { ...provider, hidden: false } : provider,
        );

        patchState(store, { focusedProviderKey, hiddenProviderKeys, knownProviders });
        void persistSettings();
      },
      hideShow: (release: DigitalRelease) => {
        const key = showKey(release);
        if (!key) return;
        patchState(store, { hiddenShowKeys: unique([...store.hiddenShowKeys(), key]) });
        void persistSettings();
      },
      clearHiddenShows: () => {
        patchState(store, { hiddenShowKeys: [] });
        void persistSettings();
      },
      setShowOnlyFavorites: (showOnlyFavorites: boolean) => {
        patchState(store, { showOnlyFavorites });
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
    hidden: provider.hidden,
    count: provider.count,
    disabled: provider.disabled,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
