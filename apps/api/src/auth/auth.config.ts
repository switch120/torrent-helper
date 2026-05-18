export type Auth0PublicConfig = {
  domain: string;
  audience: string;
  clientId: string;
  configured: boolean;
};

export function getAuth0PublicConfig(env: NodeJS.ProcessEnv = process.env): Auth0PublicConfig {
  const domain = (env.AUTH0_DOMAIN || "").trim();
  const audience = (env.AUTH0_AUDIENCE || "").trim();
  const clientId = (env.AUTH0_CLIENT_ID || "").trim();

  return {
    domain,
    audience,
    clientId,
    configured: Boolean(domain && audience && clientId),
  };
}

export function auth0IssuerBaseUrl(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
