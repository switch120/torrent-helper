import { ForbiddenException } from "@nestjs/common";
import type { JWTPayload } from "express-oauth2-jwt-bearer";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type Auth0UserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function withAuth0UserInfoClaims(
  payload: JWTPayload | undefined,
  token: string | undefined,
  issuerBaseUrl: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 2500,
): Promise<JWTPayload | undefined> {
  if (!payload || hasEmailClaims(payload) || !token || !issuerBaseUrl) {
    return payload;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetchImpl(`${issuerBaseUrl.replace(/\/+$/, "")}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) return payload;

  const userInfo = (await response.json().catch(() => ({}))) as Auth0UserInfo;
  if (userInfo.sub && payload.sub && userInfo.sub !== payload.sub) {
    throw new ForbiddenException("User profile did not match the access token.");
  }

  return {
    ...payload,
    email: userInfo.email ?? payload.email,
    email_verified: userInfo.email_verified ?? payload.email_verified,
    name: userInfo.name ?? payload.name,
    picture: userInfo.picture ?? payload.picture,
  };
}

function hasEmailClaims(payload: JWTPayload): boolean {
  return (
    typeof payload.email === "string" &&
    typeof payload.email_verified === "boolean"
  ) || (
    typeof payload["https://release-hub/email"] === "string" &&
    typeof payload["https://release-hub/email_verified"] === "boolean"
  );
}
