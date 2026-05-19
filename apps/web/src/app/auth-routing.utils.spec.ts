import "@angular/compiler";
import { HttpErrorResponse } from "@angular/common/http";
import { describe, expect, it } from "vitest";
import { googleLoginAuthorizationParams, isForbiddenAuthError, isUnauthorizedAuthError } from "./auth-routing.utils";

describe("auth routing helpers", () => {
  it("detects forbidden API profile errors without treating transient failures as access denied", () => {
    expect(isForbiddenAuthError(new HttpErrorResponse({ status: 403 }))).toBe(true);
    expect(isForbiddenAuthError(new HttpErrorResponse({ status: 500 }))).toBe(false);
    expect(isForbiddenAuthError(new Error("network hiccup"))).toBe(false);
  });

  it("detects unauthorized API profile errors", () => {
    expect(isUnauthorizedAuthError(new HttpErrorResponse({ status: 401 }))).toBe(true);
    expect(isUnauthorizedAuthError(new HttpErrorResponse({ status: 403 }))).toBe(false);
  });

  it("forces Google account selection on login", () => {
    expect(googleLoginAuthorizationParams).toEqual({
      connection: "google-oauth2",
      prompt: "select_account",
    });
  });
});
