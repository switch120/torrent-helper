export type ProviderPreference = {
  key: string;
  name: string;
  hidden: boolean;
};

export type UserSettingsResponse = {
  hiddenProviders: ProviderPreference[];
  hiddenShowKeys: string[];
  showOnlyFavorites: boolean;
};

export type UserSettingsUpdate = Partial<UserSettingsResponse>;
