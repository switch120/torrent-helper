import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { withAuth0UserInfoClaims } from "./userinfo-claims";

describe("withAuth0UserInfoClaims", () => {
  it("enriches missing email claims from Auth0 userinfo", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: "google-oauth2|123",
        email: "switch120@gmail.com",
        email_verified: true,
        name: "Scott",
        picture: "https://example.com/picture.png",
      }),
    });

    const claims = await withAuth0UserInfoClaims(
      { sub: "google-oauth2|123" },
      "token",
      "https://dev-proteus-ai.us.auth0.com",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dev-proteus-ai.us.auth0.com/userinfo",
      expect.objectContaining({
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(claims).toMatchObject({
      sub: "google-oauth2|123",
      email: "switch120@gmail.com",
      email_verified: true,
      name: "Scott",
      picture: "https://example.com/picture.png",
    });
  });

  it("rejects userinfo responses for a different subject", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: "google-oauth2|other",
        email: "switch120@gmail.com",
        email_verified: true,
      }),
    });

    await expect(
      withAuth0UserInfoClaims({ sub: "google-oauth2|123" }, "token", "https://dev-proteus-ai.us.auth0.com", fetchImpl),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
