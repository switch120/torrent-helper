import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedAppUser } from "../auth/auth.types";
import { UserSettingsService } from "./user-settings.service";
import type { UserSettingsUpdate } from "./user-settings.types";

@Controller("settings")
export class UserSettingsController {
  constructor(@Inject(UserSettingsService) private readonly settings: UserSettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedAppUser) {
    return this.settings.getSettings(user.id);
  }

  @Put()
  updateSettings(
    @CurrentUser() user: AuthenticatedAppUser,
    @Body() body: UserSettingsUpdate,
  ) {
    return this.settings.updateSettings(user.id, body);
  }
}
