import { Inject, Injectable, NestMiddleware } from "@nestjs/common";
import { auth } from "express-oauth2-jwt-bearer";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { auth0IssuerBaseUrl, getAuth0PublicConfig } from "./auth.config";
import { isStoredAllowedGoogleUser, validateAllowedAuth0User, validateGoogleAuth0Subject } from "./allowed-users";
import type { AuthenticatedRequest } from "./auth.types";
import { withAuth0UserInfoClaims } from "./userinfo-claims";

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly jwtCheck: RequestHandler | null;
  private readonly issuerBaseUrl: string;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    const config = getAuth0PublicConfig();
    this.issuerBaseUrl = auth0IssuerBaseUrl(config.domain);
    this.jwtCheck = config.configured
      ? auth({
          audience: config.audience,
          issuerBaseURL: this.issuerBaseUrl,
          tokenSigningAlg: "RS256",
        })
      : null;
  }

  use(request: Request, response: Response, next: NextFunction): void {
    if (isPublicRoute(request)) {
      next();
      return;
    }

    if (!this.jwtCheck) {
      response.status(503).json({
        statusCode: 503,
        message: "Auth0 is not configured.",
      });
      return;
    }

    this.jwtCheck(request, response, (error?: unknown) => {
      if (error) {
        next(error);
        return;
      }

      void this.attachUser(request as AuthenticatedRequest)
        .then(() => next())
        .catch(next);
    });
  }

  private async attachUser(request: AuthenticatedRequest): Promise<void> {
    const payload = request.auth?.payload;
    const sub = validateGoogleAuth0Subject(payload);
    const existingUser = await this.prisma.appUser.findUnique({
      where: { auth0Sub: sub },
    });

    if (isStoredAllowedGoogleUser(existingUser) && !hasEmailClaims(payload)) {
      request.releaseHubUser = {
        id: existingUser.id,
        auth0Sub: existingUser.auth0Sub,
        email: existingUser.email,
        name: existingUser.name,
        pictureUrl: existingUser.pictureUrl,
      };
      return;
    }

    const claims = await withAuth0UserInfoClaims(payload, request.auth?.token, this.issuerBaseUrl);
    const auth0User = validateAllowedAuth0User(claims);
    const user = await this.prisma.appUser.upsert({
      where: { auth0Sub: auth0User.sub },
      create: {
        auth0Sub: auth0User.sub,
        email: auth0User.email,
        name: auth0User.name,
        pictureUrl: auth0User.pictureUrl,
      },
      update: {
        email: auth0User.email,
        name: auth0User.name,
        pictureUrl: auth0User.pictureUrl,
      },
    });

    request.releaseHubUser = {
      id: user.id,
      auth0Sub: user.auth0Sub,
      email: user.email,
      name: user.name,
      pictureUrl: user.pictureUrl,
    };
  }
}

function isPublicRoute(request: Request): boolean {
  const path = request.path || new URL(request.originalUrl, "http://localhost").pathname;
  return path === "/api/health" || path === "/api/auth/config" || path === "/health" || path === "/auth/config";
}

function hasEmailClaims(payload: Record<string, unknown> | undefined): boolean {
  return (
    typeof payload?.email === "string" &&
    typeof payload.email_verified === "boolean"
  ) || (
    typeof payload?.["https://release-hub/email"] === "string" &&
    typeof payload["https://release-hub/email_verified"] === "boolean"
  );
}
