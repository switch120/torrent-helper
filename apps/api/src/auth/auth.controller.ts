import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { CurrentUser } from "./current-user.decorator";
import { AuthSessionService } from "./auth-session.service";
import type { AuthenticatedAppUser } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthSessionService) private readonly authSessions: AuthSessionService,
  ) {}

  @Post("login")
  login(
    @Body() body: { username?: unknown; password?: unknown },
    @Req() request: Request,
  ) {
    return this.authSessions.login(
      body?.username,
      body?.password,
      request.ip || request.socket.remoteAddress || "unknown",
    );
  }

  @Post("refresh")
  refresh(@Body() body: { refreshToken?: unknown }) {
    return this.authSessions.refresh(body?.refreshToken);
  }

  @Post("logout")
  async logout(@Body() body: { refreshToken?: unknown }) {
    await this.authSessions.logout(body?.refreshToken);
    return { loggedOut: true };
  }

  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedAppUser) {
    return user;
  }
}
