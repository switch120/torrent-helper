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
  if (!hash) return null;
  if (/^[a-z2-7]{32}$/i.test(hash)) return base32ToHex(hash);
  return hash.toLowerCase();
}

function base32ToHex(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let buffer = 0;
  let bits = 0;
  let hex = "";

  for (const character of value.toUpperCase()) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      hex += ((buffer >> bits) & 0xff).toString(16).padStart(2, "0");
      buffer &= (1 << bits) - 1;
    }
  }
  return hex;
}
