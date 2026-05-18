import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "./current-user.decorator";
import { getAuth0PublicConfig } from "./auth.config";
import type { AuthenticatedAppUser } from "./auth.types";

@Controller("auth")
export class AuthController {
  @Get("config")
  getConfig() {
    return getAuth0PublicConfig();
  }

  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedAppUser) {
    return user;
  }
}
