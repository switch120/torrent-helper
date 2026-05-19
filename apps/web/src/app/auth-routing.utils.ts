import { HttpErrorResponse } from "@angular/common/http";

export const googleLoginAuthorizationParams = {
  connection: "google-oauth2",
  prompt: "select_account",
} as const;

export function isForbiddenAuthError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403;
}

export function isUnauthorizedAuthError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}
