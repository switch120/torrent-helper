import type { Request } from "express";

export type AuthenticatedAppUser = {
  id: number;
  auth0Sub: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

export type AllowedAuth0User = Omit<AuthenticatedAppUser, "id" | "auth0Sub"> & {
  sub: string;
};

export type AuthenticatedRequest = Request & {
  releaseHubUser?: AuthenticatedAppUser;
};
