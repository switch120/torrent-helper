import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedAppUser, AuthenticatedRequest } from "./auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAppUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.releaseHubUser) {
      throw new UnauthorizedException("Authentication is required.");
    }
    return request.releaseHubUser;
  },
);
