import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { JWTPayload } from "express-oauth2-jwt-bearer";
import type { AllowedAuth0User } from "./auth.types";

const allowedEmails = new Set(["switch120@gmail.com"]);
const googleProviderPrefix = "google-oauth2|";

export function validateAllowedAuth0User(payload: JWTPayload | undefined): AllowedAuth0User {
  const sub = validateGoogleAuth0Subject(payload);
  const claims = payload as JWTPayload;

  const email = stringClaim(claims.email) || stringClaim(claims["https://release-hub/email"]);
  if (!email || !allowedEmails.has(email.toLowerCase())) {
    throw new ForbiddenException("This user is not allowed.");
  }

  const emailVerified = booleanClaim(claims.email_verified) ?? booleanClaim(claims["https://release-hub/email_verified"]);
  if (emailVerified !== true) {
    throw new ForbiddenException("Email verification is required.");
  }

  return {
    sub,
    email: email.toLowerCase(),
    name: stringClaim(claims.name) || null,
    pictureUrl: stringClaim(claims.picture) || null,
  };
}

export function validateGoogleAuth0Subject(payload: JWTPayload | undefined): string {
  if (!payload) {
    throw new UnauthorizedException("Authentication is required.");
  }

  const sub = stringClaim(payload.sub);
  if (!sub) {
    throw new UnauthorizedException("Authentication is required.");
  }
  if (!sub.startsWith(googleProviderPrefix)) {
    throw new ForbiddenException("Google login is required.");
  }

  return sub;
}

export function isStoredAllowedGoogleUser<T extends {
  auth0Sub: string;
  email: string;
}>(value: T | null | undefined): value is T {
  return Boolean(
    value &&
    value.auth0Sub.startsWith(googleProviderPrefix) &&
    allowedEmails.has(value.email.toLowerCase()),
  );
}

function stringClaim(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function booleanClaim(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
