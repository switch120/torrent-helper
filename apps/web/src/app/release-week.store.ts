import { computed, inject } from "@angular/core";
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals";
import { ReleaseApiClient } from "./release-api.client";
import type { DigitalRelease, ProviderFilter, ReleaseWeekResponse, ReleaseWeekStatus } from "./release.models";
import {
  addWeeks,
  buildReleaseSections,
  cacheLabel,
  collectProviderFilters,
  formatWeekRange,
  providerKey,
  startOfIsoWeek,
  weekEndFromStart,
} from "./release-week.utils";

type ReleaseWeekState = {
  weekStart: string;
  response: ReleaseWeekResponse | null;
  status: ReleaseWeekStatus;
  error: string | null;
  hiddenProviderKeys: string[];
  knownProviders: ProviderFilter[];
};

const initialWeekStart = startOfIsoWeek();
const providerStorageKey = "releaseHub.providerFilters.v1";

export const ReleaseWeekStore = signalStore(
  { providedIn: "root" },
  withState<ReleaseWeekState>({
    weekStart: initialWeekStart,
    response: null,
    status: "idle",
    error: null,
    hiddenProviderKeys: readProviderPreferences().filter((provider) => provider.hidden).map((provider) => provider.key),
    knownProviders: readProviderPreferences(),
  }),
  withComputed((store) => ({
    hiddenProviderKeySet: computed(() => new Set(store.hiddenProviderKeys())),
    sections: computed(() => buildReleaseSections(store.response(), new Set(store.hiddenProviderKeys()))),
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
      if (!response) return formatWeekRange(store.weekStart(), weekEndFromStart(store.weekStart()));
      return formatWeekRange(response.weekStart, response.weekEnd);
    }),
    cacheMessage: computed(() =>
      cacheLabel(store.status(), store.error(), store.response()?.cache ?? null),
    ),
  })),
  withMethods((store, api = inject(ReleaseApiClient)) => {
    async function load(weekStart: string, refresh: boolean) {
      patchState(store, {
        weekStart,
        status: refresh ? "refreshing" : "loading",
        error: null,
      });

      try {
        const response = refresh
          ? await api.refreshWeek(weekStart)
          : await api.getWeek(weekStart);

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
        persistProviderPreferences(knownProviders, store.hiddenProviderKeys());
      } catch (error) {
        patchState(store, {
          status: "error",
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
        const key = providerKey(release);
        const hiddenProviderKeys = unique([...store.hiddenProviderKeys(), key]);
        const knownProviders = mergeKnownProviders(store.knownProviders(), [
          { key, name: release.sourceName, hidden: true },
        ]);
        patchState(store, { hiddenProviderKeys, knownProviders });
        persistProviderPreferences(knownProviders, hiddenProviderKeys);
      },
      setProviderHidden: (key: string, hidden: boolean) => {
        const hiddenProviderKeys = hidden
          ? unique([...store.hiddenProviderKeys(), key])
          : store.hiddenProviderKeys().filter((candidate) => candidate !== key);
        const knownProviders = store.knownProviders().map((provider) =>
          provider.key === key ? { ...provider, hidden } : provider,
        );
        patchState(store, { hiddenProviderKeys, knownProviders });
        persistProviderPreferences(knownProviders, hiddenProviderKeys);
      },
    };
  }),
);

function readProviderPreferences(): ProviderFilter[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const parsed = JSON.parse(localStorage.getItem(providerStorageKey) || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is ProviderFilter =>
        Boolean(item) &&
        typeof item.key === "string" &&
        typeof item.name === "string" &&
        typeof item.hidden === "boolean",
      );
  } catch {
    return [];
  }
}

function persistProviderPreferences(
  knownProviders: ProviderFilter[],
  hiddenProviderKeys: string[],
): void {
  if (typeof localStorage === "undefined") return;
  const hiddenSet = new Set(hiddenProviderKeys);
  const preferences = knownProviders.map((provider) => ({
    key: provider.key,
    name: provider.name,
    hidden: hiddenSet.has(provider.key),
  }));
  localStorage.setItem(providerStorageKey, JSON.stringify(preferences));
}

function mergeKnownProviders(
  existing: ProviderFilter[],
  incoming: ProviderFilter[],
): ProviderFilter[] {
  const providers = new Map<string, ProviderFilter>();
  for (const provider of existing) providers.set(provider.key, provider);
  for (const provider of incoming) providers.set(provider.key, provider);
  return [...providers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
