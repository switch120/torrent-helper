import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, switchMap, throwError } from "rxjs";
import { AuthSessionService } from "./auth-session.service";

export const authSessionInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith("/api/") || isUnauthenticatedEndpoint(request)) {
    return next(request);
  }

  const auth = inject(AuthSessionService);
  return auth.ensureAccessToken().pipe(
    switchMap((token) =>
      next(withBearerToken(request, token)).pipe(
        catchError((error) => {
          if (!isAccessTokenRejection(error)) return throwError(() => error);

          return auth.refreshAccessToken(true).pipe(
            catchError((refreshError) => {
              if (isTerminalRefreshFailure(refreshError)) {
                auth.clearSession();
              }
              return throwError(() => refreshError);
            }),
            switchMap((nextToken) => {
              if (!nextToken) {
                auth.clearSession();
                return throwError(() => error);
              }
              return next(withBearerToken(request, nextToken));
            }),
          );
        }),
      ),
    ),
  );
};

function withBearerToken<T>(
  request: HttpRequest<T>,
  token: string | undefined,
): HttpRequest<T> {
  if (!token || request.headers.has("Authorization")) return request;
  return request.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function isAccessTokenRejection(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 401
  );
}

function isTerminalRefreshFailure(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

function isUnauthenticatedEndpoint(request: HttpRequest<unknown>): boolean {
  return /\/api\/auth\/(?:login|refresh|logout)(?:[?#]|$)/.test(request.url);
}
