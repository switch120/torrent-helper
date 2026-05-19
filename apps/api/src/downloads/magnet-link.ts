export function extractMagnetHash(magnetLink: string): string | null {
  if (!magnetLink.startsWith("magnet:")) return null;

  let params: URLSearchParams;
  try {
    params = new URL(magnetLink).searchParams;
  } catch {
    return null;
  }

  const exactTopic = params.getAll("xt").find((value) => value.toLowerCase().startsWith("urn:btih:"));
  if (!exactTopic) return null;

  const hash = exactTopic.slice("urn:btih:".length).trim();
  return hash ? hash.toLowerCase() : null;
}
