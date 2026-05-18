import { Body, Controller, Delete, Get, Inject, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedAppUser } from "../auth/auth.types";
import { FavoritesService } from "./favorites.service";

@Controller("favorites")
export class FavoritesController {
  constructor(@Inject(FavoritesService) private readonly favorites: FavoritesService) {}

  @Get()
  listFavorites(@CurrentUser() user: AuthenticatedAppUser) {
    return this.favorites.listFavorites(user.id);
  }

  @Post()
  addFavorite(
    @CurrentUser() user: AuthenticatedAppUser,
    @Body("eventId") eventId: string,
  ) {
    return this.favorites.addFavorite(user.id, eventId);
  }

  @Delete(":showKey")
  removeFavorite(
    @CurrentUser() user: AuthenticatedAppUser,
    @Param("showKey") showKey: string,
  ) {
    return this.favorites.removeFavorite(user.id, decodeURIComponent(showKey));
  }
}
