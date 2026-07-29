import type { Request } from "express";

export type AuthenticatedAppUser = {
  id: number;
  username: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

export type AuthSessionResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedAppUser;
};

export type AuthenticatedRequest = Request & {
  releaseHubUser?: AuthenticatedAppUser;
};
