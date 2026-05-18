import { describe, expect, it, vi } from "vitest";
import { AuthMiddleware } from "./auth.middleware";
import type { AuthenticatedRequest } from "./auth.types";

describe("AuthMiddleware", () => {
  it("uses the stored allowlisted Google user when refreshed access tokens omit email claims", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 1,
      auth0Sub: "google-oauth2|105402711274954610557",
      email: "switch120@gmail.com",
      name: "Scott",
      pictureUrl: "https://example.com/scott.png",
    });
    const upsert = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("userinfo should not be called"));
    vi.stubGlobal("fetch", fetchImpl);

    const middleware = new AuthMiddleware({ appUser: { findUnique, upsert } } as never);
    const request = {
      auth: {
        payload: {
          sub: "google-oauth2|105402711274954610557",
        },
        token: "refreshed-access-token",
      },
    } as AuthenticatedRequest;

    await (
      middleware as unknown as {
        attachUser(request: AuthenticatedRequest): Promise<void>;
      }
    ).attachUser(request);

    expect(findUnique).toHaveBeenCalledWith({
      where: { auth0Sub: "google-oauth2|105402711274954610557" },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(request.releaseHubUser).toEqual({
      id: 1,
      auth0Sub: "google-oauth2|105402711274954610557",
      email: "switch120@gmail.com",
      name: "Scott",
      pictureUrl: "https://example.com/scott.png",
    });

    vi.unstubAllGlobals();
  });
});
