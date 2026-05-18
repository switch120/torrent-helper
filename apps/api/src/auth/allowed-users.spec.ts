import { describe, expect, it } from "vitest";
import { validateAllowedAuth0User } from "./allowed-users";

describe("validateAllowedAuth0User", () => {
  it("accepts the verified allowlisted Google identity", () => {
    const result = validateAllowedAuth0User({
      sub: "google-oauth2|123",
      email: "switch120@gmail.com",
      email_verified: true,
    });

    expect(result).toEqual({
      sub: "google-oauth2|123",
      email: "switch120@gmail.com",
      name: null,
      pictureUrl: null,
    });
  });

  it("rejects missing tokens, wrong emails, unverified emails, and non-Google identities", () => {
    expect(() => validateAllowedAuth0User(undefined)).toThrow("Authentication is required.");
    expect(() =>
      validateAllowedAuth0User({
        sub: "google-oauth2|123",
        email: "someone@example.com",
        email_verified: true,
      }),
    ).toThrow("This user is not allowed.");
    expect(() =>
      validateAllowedAuth0User({
        sub: "google-oauth2|123",
        email: "switch120@gmail.com",
        email_verified: false,
      }),
    ).toThrow("Email verification is required.");
    expect(() =>
      validateAllowedAuth0User({
        sub: "auth0|123",
        email: "switch120@gmail.com",
        email_verified: true,
      }),
    ).toThrow("Google login is required.");
  });
});
