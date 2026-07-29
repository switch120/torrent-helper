import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedAppUser, AuthSessionResponse } from "./auth.types";
import { PasswordService } from "./password.service";

const ACCESS_TOKEN_ISSUER = "release-hub";
const ACCESS_TOKEN_AUDIENCE = "release-hub-api";
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_REUSE_GRACE_MS = 30_000;
const DEFAULT_LOCAL_USERNAME = "admin";
const DEFAULT_LOCAL_PASSWORD = "admin@123";
const DEFAULT_LOCAL_EMAIL = "switch120@gmail.com";
const LOCAL_ADMIN_KEY = "primary";
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 60_000;
const LOGIN_BACKOFF_MS = 60_000;
const LOGIN_ATTEMPT_STATE_LIMIT = 10_000;

type AccessTokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
};

type AuthUserRecord = {
  id: number;
  username: string;
  passwordHash: string | null;
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

type LoginAttemptState = {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
};

@Injectable()
export class AuthSessionService implements OnModuleInit {
  private readonly loginAttempts = new Map<string, LoginAttemptState>();
  private nextLoginAttemptCleanupAt = 0;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureLocalAdmin();
  }

  async login(
    usernameValue: unknown,
    passwordValue: unknown,
    sourceValue: unknown = "unknown",
  ): Promise<AuthSessionResponse> {
    const username = this.normalizedUsername(usernameValue);
    const password = typeof passwordValue === "string" ? passwordValue : "";
    const attemptKeys = this.claimLoginAttempt(username, sourceValue);
    const user = username
      ? await this.prisma.appUser.findUnique({ where: { username } })
      : null;

    if (!user || !(await this.passwords.verifyPassword(user.passwordHash, password))) {
      this.recordLoginFailure(attemptKeys);
      throw new UnauthorizedException("Invalid username or password.");
    }

    this.clearLoginAttempts(attemptKeys);
    return this.issueTokenPair(user);
  }

  async refresh(refreshTokenValue: unknown): Promise<AuthSessionResponse> {
    const refreshToken = this.optionalString(refreshTokenValue);
    if (!refreshToken) throw new UnauthorizedException("Invalid refresh token.");

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(refreshToken) },
    });
    if (!existing) throw new UnauthorizedException("Invalid refresh token.");

    const now = new Date();
    if (existing.revokedAt) {
      throw new UnauthorizedException("Invalid refresh token.");
    }
    if (existing.expiresAt <= now) {
      await this.revokeRefreshTokenLineage(existing.id);
      throw new UnauthorizedException("Invalid refresh token.");
    }
    if (existing.rotatedAt) {
      if (now.getTime() - existing.rotatedAt.getTime() > REFRESH_TOKEN_REUSE_GRACE_MS) {
        await this.revokeRefreshTokenLineage(existing.id);
        throw new UnauthorizedException("Invalid refresh token.");
      }
      throw rotatedRefreshTokenException();
    }

    const user = await this.prisma.appUser.findUnique({ where: { id: existing.userId } });
    if (!user) {
      await this.revokeRefreshTokenLineage(existing.id);
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const nextRefreshToken = this.generateRefreshToken();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "AppUser" WHERE "id" = ${user.id} FOR UPDATE
      `;
      const claimed = await transaction.refreshToken.updateMany({
        where: {
          id: existing.id,
          revokedAt: null,
          rotatedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          rotatedAt: now,
          lastUsedAt: now,
        },
      });
      if (claimed.count !== 1) {
        const current = await transaction.refreshToken.findUnique({
          where: { id: existing.id },
          select: { revokedAt: true, rotatedAt: true },
        });
        if (
          !current?.revokedAt &&
          current?.rotatedAt &&
          Date.now() - current.rotatedAt.getTime() <= REFRESH_TOKEN_REUSE_GRACE_MS
        ) {
          throw rotatedRefreshTokenException();
        }
        throw new UnauthorizedException("Invalid refresh token.");
      }

      const next = await transaction.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashRefreshToken(nextRefreshToken),
          expiresAt: this.refreshExpiry(),
        },
      });
      await transaction.refreshToken.update({
        where: { id: existing.id },
        data: { replacedByTokenId: next.id },
      });
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken: nextRefreshToken,
      user: this.authenticatedUser(user),
    };
  }

  async logout(refreshTokenValue: unknown): Promise<void> {
    const refreshToken = this.optionalString(refreshTokenValue);
    if (!refreshToken) return;

    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(refreshToken) },
    });
    if (!existing) return;

    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "AppUser" WHERE "id" = ${existing.userId} FOR UPDATE
      `;
      const seen = new Set<number>();
      let currentId: number | null = existing.id;
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const current: { replacedByTokenId: number | null } | null =
          await transaction.refreshToken.findUnique({
            where: { id: currentId },
            select: { replacedByTokenId: true },
          });
        await transaction.refreshToken.updateMany({
          where: { id: currentId, revokedAt: null },
          data: { revokedAt },
        });
        currentId = current?.replacedByTokenId ?? null;
      }
    });
  }

  async verifyAccessToken(accessToken: string): Promise<AuthenticatedAppUser> {
    const payload = this.verifyAndDecodeAccessToken(accessToken);
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new UnauthorizedException("Invalid access token.");
    }

    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Invalid access token.");
    return this.authenticatedUser(user);
  }

  private async ensureLocalAdmin(): Promise<void> {
    const username = this.normalizedUsername(process.env.LOCAL_AUTH_USERNAME) || DEFAULT_LOCAL_USERNAME;
    const password = process.env.LOCAL_AUTH_PASSWORD || DEFAULT_LOCAL_PASSWORD;
    const email = this.normalizedEmail(process.env.LOCAL_AUTH_EMAIL) || DEFAULT_LOCAL_EMAIL;
    const localAdmin = await this.prisma.appUser.findUnique({
      where: { localAuthKey: LOCAL_ADMIN_KEY },
    });
    const existing = localAdmin ?? await this.prisma.appUser.findFirst({
      where: { OR: [{ username }, { email }] },
    });

    if (!existing) {
      await this.prisma.appUser.create({
        data: {
          localAuthKey: LOCAL_ADMIN_KEY,
          username,
          passwordHash: await this.passwords.hashPassword(password),
          email,
          name: process.env.LOCAL_AUTH_NAME?.trim() || "Release Hub Admin",
        },
      });
      return;
    }

    const passwordMatches = await this.passwords.verifyPassword(existing.passwordHash, password);
    if (
      existing.localAuthKey === LOCAL_ADMIN_KEY &&
      existing.username === username &&
      existing.email === email &&
      passwordMatches
    ) {
      return;
    }

    const passwordHash = passwordMatches
      ? existing.passwordHash
      : await this.passwords.hashPassword(password);
    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.appUser.update({
        where: { id: existing.id },
        data: {
          localAuthKey: LOCAL_ADMIN_KEY,
          username,
          email,
          passwordHash,
        },
      });
      if (!passwordMatches) {
        await transaction.refreshToken.updateMany({
          where: { userId: existing.id, revokedAt: null },
          data: { revokedAt },
        });
      }
    });
  }

  private async issueTokenPair(user: AuthUserRecord): Promise<AuthSessionResponse> {
    const refreshToken = this.generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: this.refreshExpiry(),
      },
    });

    return {
      accessToken: this.signAccessToken(user),
      refreshToken,
      user: this.authenticatedUser(user),
    };
  }

  private claimLoginAttempt(
    username: string | undefined,
    sourceValue: unknown,
  ): string[] {
    const now = Date.now();
    this.cleanupLoginAttempts(now);
    const source = this.optionalString(sourceValue) || "unknown";
    const keys = [`source:${source}`, `account:${username || "<missing>"}`];
    let retryAfterMs = 0;

    for (const key of keys) {
      const state = this.loginAttempts.get(key);
      if (!state) continue;
      if (state.blockedUntil > now) {
        retryAfterMs = Math.max(retryAfterMs, state.blockedUntil - now);
      } else if (
        state.attempts >= LOGIN_ATTEMPT_LIMIT &&
        now - state.windowStartedAt < LOGIN_ATTEMPT_WINDOW_MS
      ) {
        retryAfterMs = Math.max(
          retryAfterMs,
          LOGIN_ATTEMPT_WINDOW_MS - (now - state.windowStartedAt),
        );
      }
    }

    if (retryAfterMs > 0 || this.loginAttempts.size >= LOGIN_ATTEMPT_STATE_LIMIT) {
      throw this.tooManyLoginAttempts(retryAfterMs || LOGIN_BACKOFF_MS);
    }

    for (const key of keys) {
      const current = this.loginAttempts.get(key);
      const state = !current || now - current.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS
        ? { attempts: 0, windowStartedAt: now, blockedUntil: 0 }
        : current;
      state.attempts += 1;
      this.loginAttempts.set(key, state);
    }
    return keys;
  }

  private recordLoginFailure(keys: string[]): void {
    const blockedUntil = Date.now() + LOGIN_BACKOFF_MS;
    for (const key of keys) {
      const state = this.loginAttempts.get(key);
      if (state && state.attempts >= LOGIN_ATTEMPT_LIMIT) {
        state.blockedUntil = blockedUntil;
      }
    }
  }

  private clearLoginAttempts(keys: string[]): void {
    for (const key of keys) this.loginAttempts.delete(key);
  }

  private cleanupLoginAttempts(now: number): void {
    if (now < this.nextLoginAttemptCleanupAt) return;
    this.nextLoginAttemptCleanupAt = now + LOGIN_ATTEMPT_WINDOW_MS;
    for (const [key, state] of this.loginAttempts) {
      if (
        state.blockedUntil <= now &&
        now - state.windowStartedAt >= LOGIN_ATTEMPT_WINDOW_MS
      ) {
        this.loginAttempts.delete(key);
      }
    }
  }

  private tooManyLoginAttempts(retryAfterMs: number): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Too Many Requests",
        message: "Too many login attempts. Try again later.",
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private signAccessToken(user: AuthUserRecord): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = this.base64UrlJson({ alg: "HS256", typ: "JWT" });
    const payload = this.base64UrlJson({
      iss: ACCESS_TOKEN_ISSUER,
      aud: ACCESS_TOKEN_AUDIENCE,
      sub: String(user.id),
      iat: issuedAt,
      exp: issuedAt + this.accessTokenTtlSeconds(),
    });
    const signature = createHmac("sha256", this.accessTokenSecret())
      .update(`${header}.${payload}`)
      .digest("base64url");
    return `${header}.${payload}.${signature}`;
  }

  private verifyAndDecodeAccessToken(accessToken: string): AccessTokenPayload {
    const [headerText, payloadText, signatureText, ...remainder] = accessToken.split(".");
    if (!headerText || !payloadText || !signatureText || remainder.length > 0) {
      throw new UnauthorizedException("Invalid access token.");
    }

    const expectedSignature = createHmac("sha256", this.accessTokenSecret())
      .update(`${headerText}.${payloadText}`)
      .digest();
    const actualSignature = Buffer.from(signatureText, "base64url");
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      throw new UnauthorizedException("Invalid access token.");
    }

    try {
      const header = JSON.parse(Buffer.from(headerText, "base64url").toString("utf8")) as {
        alg?: unknown;
        typ?: unknown;
      };
      const payload = JSON.parse(
        Buffer.from(payloadText, "base64url").toString("utf8"),
      ) as Partial<AccessTokenPayload>;
      const now = Math.floor(Date.now() / 1000);

      if (
        header.alg !== "HS256" ||
        header.typ !== "JWT" ||
        payload.iss !== ACCESS_TOKEN_ISSUER ||
        payload.aud !== ACCESS_TOKEN_AUDIENCE ||
        typeof payload.sub !== "string" ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number"
      ) {
        throw new UnauthorizedException("Invalid access token.");
      }
      if (payload.exp <= now) {
        throw new UnauthorizedException({
          code: "access_token_expired",
          message: "Access token expired.",
        });
      }

      return payload as AccessTokenPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid access token.");
    }
  }

  private async revokeRefreshTokenLineage(id: number): Promise<void> {
    const root = await this.prisma.refreshToken.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!root) return;

    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "AppUser" WHERE "id" = ${root.userId} FOR UPDATE
      `;
      const seen = new Set<number>();
      let currentId: number | null = id;

      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const current: { replacedByTokenId: number | null } | null =
          await transaction.refreshToken.findUnique({
            where: { id: currentId },
            select: { replacedByTokenId: true },
          });
        await transaction.refreshToken.updateMany({
          where: { id: currentId, revokedAt: null },
          data: { revokedAt },
        });
        currentId = current?.replacedByTokenId ?? null;
      }
    });
  }

  private authenticatedUser(user: AuthUserRecord): AuthenticatedAppUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      pictureUrl: user.pictureUrl,
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString("base64url");
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("hex");
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTokenTtlDays() * 24 * 60 * 60 * 1000);
  }

  private accessTokenSecret(): string {
    const configured = process.env.AUTH_ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
    if (configured?.trim()) return configured.trim();
    if ((process.env.NODE_ENV || "").toLowerCase() === "production") {
      throw new Error("AUTH_ACCESS_TOKEN_SECRET is required in production.");
    }
    return "local-dev-compose-secret";
  }

  private accessTokenTtlSeconds(): number {
    return this.positiveNumber(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS, DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
  }

  private refreshTokenTtlDays(): number {
    return this.positiveNumber(process.env.AUTH_REFRESH_TOKEN_TTL_DAYS, DEFAULT_REFRESH_TOKEN_TTL_DAYS);
  }

  private positiveNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private base64UrlJson(value: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  private normalizedUsername(value: unknown): string | undefined {
    return typeof value === "string" && value.trim()
      ? value.trim().toLowerCase()
      : undefined;
  }

  private normalizedEmail(value: unknown): string | undefined {
    const email = this.optionalString(value)?.toLowerCase();
    return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : undefined;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
}

function rotatedRefreshTokenException(): UnauthorizedException {
  return new UnauthorizedException({
    code: "refresh_token_rotated",
    message: "Invalid refresh token.",
  });
}
