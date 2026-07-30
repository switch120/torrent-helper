import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
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

  @Get(":showKey/seasons/:seasonNumber")
  getSeason(
    @CurrentUser() user: AuthenticatedAppUser,
    @Param("showKey") showKey: string,
    @Param("seasonNumber", ParseIntPipe) seasonNumber: number,
  ) {
    return this.favorites.getSeason(user.id, decodeURIComponent(showKey), seasonNumber);
  }

  @Get(":showKey/seasons/:seasonNumber/episodes/:episodeNumber/torrents")
  searchEpisodeTorrents(
    @CurrentUser() user: AuthenticatedAppUser,
    @Param("showKey") showKey: string,
    @Param("seasonNumber", ParseIntPipe) seasonNumber: number,
    @Param("episodeNumber", ParseIntPipe) episodeNumber: number,
    @Query("quality") quality: string = "2160p",
  ) {
    return this.favorites.searchEpisodeTorrents(
      user.id,
      decodeURIComponent(showKey),
      seasonNumber,
      episodeNumber,
      quality,
    );
  }

  @Post(":showKey/seasons/:seasonNumber/episodes/:episodeNumber/downloads")
  addEpisodeDownload(
    @CurrentUser() user: AuthenticatedAppUser,
    @Param("showKey") showKey: string,
    @Param("seasonNumber", ParseIntPipe) seasonNumber: number,
    @Param("episodeNumber", ParseIntPipe) episodeNumber: number,
    @Body() body: { magnetLink?: string; downloadDir?: string },
  ) {
    return this.favorites.addEpisodeDownload(
      user.id,
      decodeURIComponent(showKey),
      seasonNumber,
      episodeNumber,
      body,
    );
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
