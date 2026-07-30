import { Inject, Injectable, NestMiddleware, UnauthorizedException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { AuthSessionService } from "./auth-session.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(AuthSessionService) private readonly authSessions: AuthSessionService,
  ) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    if (isPublicRoute(request)) {
      next();
      return;
    }

    const token = bearerToken(request.headers.authorization);
    if (!token) {
      next(new UnauthorizedException("Bearer access token is required."));
      return;
    }

    void this.authSessions
      .verifyAccessToken(token)
      .then((user) => {
        (request as AuthenticatedRequest).releaseHubUser = user;
        next();
      })
      .catch(next);
  }
}

function isPublicRoute(request: Request): boolean {
  const path = request.path || new URL(request.originalUrl, "http://localhost").pathname;
  return (
    path === "/api/health" ||
    path === "/health" ||
    /^\/(?:api\/)?auth\/(?:login|refresh|logout)\/?$/.test(path)
  );
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}
