import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  tap,
  throwError,
} from "rxjs";
import type { AuthenticatedUser } from "./release.models";

export type AuthSessionResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
};

type StoredAuthSession = {
  accessToken?: string;
  refreshToken: string;
  user?: AuthenticatedUser;
};

const SESSION_STORAGE_KEY = "release-hub.auth.session.v1";
const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 30;

@Injectable({ providedIn: "root" })
export class AuthSessionService {
  private readonly http = inject(HttpClient);
  private readonly storage = this.browserStorage();
  private readonly storedSession = this.loadStoredSession();
  private readonly sessionSubject = new BehaviorSubject<StoredAuthSession | undefined>(
    this.storedSession,
  );
  private accessToken = this.storedSession?.accessToken;
  private refreshRequest?: Observable<AuthSessionResponse>;
  private sessionGeneration = 0;

  readonly session$ = this.sessionSubject.asObservable();
  readonly user$ = this.session$.pipe(map((session) => session?.user));
  readonly isAuthenticated$ = this.session$.pipe(
    map((session) => Boolean(session?.refreshToken)),
  );

  snapshot(): AuthenticatedUser | undefined {
    return this.sessionSubject.value?.user;
  }

  hasStoredSession(): boolean {
    return Boolean(this.sessionSubject.value?.refreshToken);
  }

  login(username: string, password: string): Observable<AuthSessionResponse> {
    return this.http
      .post<AuthSessionResponse>("/api/auth/login", { username, password })
      .pipe(tap((session) => this.storeSession(session)));
  }

  ensureAccessToken(): Observable<string | undefined> {
    const accessToken = this.usableAccessToken();
    return accessToken ? of(accessToken) : this.refreshAccessToken(true);
  }

  refreshAccessToken(force = false): Observable<string | undefined> {
    const storedSession = this.loadStoredSession();
    if (
      storedSession?.refreshToken &&
      storedSession.refreshToken !== this.sessionSubject.value?.refreshToken
    ) {
      this.accessToken = storedSession.accessToken;
      this.sessionSubject.next(storedSession);
    }

    const accessToken = this.usableAccessToken();
    if (!force && accessToken) return of(accessToken);

    const refreshToken = this.sessionSubject.value?.refreshToken;
    if (!refreshToken) return of(undefined);

    if (!this.refreshRequest) {
      const requestGeneration = this.sessionGeneration;
      const request = this.http
        .post<AuthSessionResponse>("/api/auth/refresh", { refreshToken })
        .pipe(
          tap((session) => {
            if (this.sessionGeneration === requestGeneration) {
              this.storeSession(session);
            }
          }),
          catchError((error) => {
            const latestStoredSession = this.loadStoredSession();
            if (
              latestStoredSession?.accessToken &&
              latestStoredSession.user &&
              latestStoredSession.refreshToken !== refreshToken
            ) {
              this.accessToken = latestStoredSession.accessToken;
              this.sessionSubject.next(latestStoredSession);
              return of(latestStoredSession as AuthSessionResponse);
            }
            this.clearSession();
            return throwError(() => error);
          }),
          finalize(() => {
            if (this.refreshRequest === request) {
              this.refreshRequest = undefined;
            }
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
      this.refreshRequest = request;
    }

    const subscriberGeneration = this.sessionGeneration;
    return this.refreshRequest.pipe(
      map((session) =>
        this.sessionGeneration === subscriberGeneration
          ? session.accessToken
          : undefined,
      ),
    );
  }

  storeUserSnapshot(user: AuthenticatedUser): void {
    const session = this.sessionSubject.value;
    if (!session) return;
    this.persistSession({
      ...session,
      accessToken: this.accessToken || session.accessToken,
      user,
    });
  }

  logout(): Observable<void> {
    const refreshToken =
      this.loadStoredSession()?.refreshToken ||
      this.sessionSubject.value?.refreshToken;
    this.clearSession();
    if (!refreshToken) return of(undefined);

    return this.http.post("/api/auth/logout", { refreshToken }).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  clearSession(): void {
    this.sessionGeneration += 1;
    this.accessToken = undefined;
    this.refreshRequest = undefined;
    this.storage?.removeItem(SESSION_STORAGE_KEY);
    this.sessionSubject.next(undefined);
  }

  private storeSession(session: AuthSessionResponse): void {
    this.accessToken = session.accessToken;
    this.persistSession(session);
  }

  private persistSession(session: StoredAuthSession): void {
    this.storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    this.sessionSubject.next(session);
  }

  private usableAccessToken(): string | undefined {
    if (!this.accessToken) return undefined;
    return this.isAccessTokenExpired(this.accessToken) ? undefined : this.accessToken;
  }

  private isAccessTokenExpired(accessToken: string): boolean {
    const [, payload] = accessToken.split(".");
    if (!payload || typeof atob !== "function") return false;

    try {
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const claims = JSON.parse(atob(padded)) as { exp?: unknown };
      return (
        typeof claims.exp === "number" &&
        claims.exp <= Math.floor(Date.now() / 1000) + ACCESS_TOKEN_REFRESH_SKEW_SECONDS
      );
    } catch {
      return false;
    }
  }

  private loadStoredSession(): StoredAuthSession | undefined {
    const raw = this.storage?.getItem(SESSION_STORAGE_KEY);
    if (!raw) return undefined;

    try {
      const parsed = JSON.parse(raw) as StoredAuthSession;
      return parsed.refreshToken ? parsed : undefined;
    } catch {
      this.storage?.removeItem(SESSION_STORAGE_KEY);
      return undefined;
    }
  }

  private browserStorage(): Storage | undefined {
    return typeof window === "undefined" ? undefined : window.localStorage;
  }
}
