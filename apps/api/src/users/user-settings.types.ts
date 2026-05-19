export type ProviderPreference = {
  key: string;
  name: string;
  hidden: boolean;
};

export type UserSettingsResponse = {
  hiddenProviders: ProviderPreference[];
  selectedProviders: ProviderPreference[];
  hiddenShowKeys: string[];
  showOnlyFavorites: boolean;
  showInternational: boolean;
  showDubbed: boolean;
};

export type UserSettingsUpdate = Partial<UserSettingsResponse>;
