const FAVORITE_EPISODE_EVENT_ID = /^(?:tmdb:\d+|title:.+):s\d+:e\d+$/;

export function isFavoriteEpisodeEventId(
  eventId: string | null | undefined,
): boolean {
  return Boolean(eventId && FAVORITE_EPISODE_EVENT_ID.test(eventId));
}
