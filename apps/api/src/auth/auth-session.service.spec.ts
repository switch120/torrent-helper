import { HttpException, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionService } from "./auth-session.service";
import { PasswordService } from "./password.service";

describe("AuthSessionService", () => {
  const user = {
    id: 1,
    localAuthKey: "primary",
    username: "admin",
    passwordHash: "",
    email: "switch120@gmail.com",
    name: "Scott Byers",
    pictureUrl: null,
  };

  beforeEach(() => {
    process.env.AUTH_ACCESS_TOKEN_SECRET = "test-release-hub-secret";
    process.env.AUTH_REFRESH_TOKEN_ROTATION_SECRET =
      "test-refresh-token-rotation-secret";
    delete process.env.LOCAL_AUTH_USERNAME;
    delete process.env.LOCAL_AUTH_PASSWORD;
    delete process.env.LOCAL_AUTH_EMAIL;
  });

  afterEach(() => {
    delete process.env.AUTH_REFRESH_TOKEN_ROTATION_SECRET;
    delete process.env.LOCAL_AUTH_USERNAME;
    delete process.env.LOCAL_AUTH_PASSWORD;
    delete process.env.LOCAL_AUTH_EMAIL;
  });

  it("issues a verifiable token pair for admin without changing the user id", async () => {
    const passwords = new PasswordService();
    const storedUser = {
      ...user,
      passwordHash: await passwords.hashPassword("admin@123"),
    };
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      appUser: {
        findUnique: vi.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.username === "admin" || where.id === storedUser.id ? storedUser : null,
          ),
        ),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({ id: 10 }),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords);

    const session = await service.login("ADMIN", "admin@123");
    const authenticated = await service.verifyAccessToken(session.accessToken);

    expect(session.refreshToken).toHaveLength(64);
    expect(session.user).toEqual({
      id: 1,
      username: "admin",
      email: "switch120@gmail.com",
      name: "Scott Byers",
      pictureUrl: null,
    });
    expect(authenticated.id).toBe(1);
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 1 }),
    });
  });

  it("rejects invalid credentials without exposing which value failed", async () => {
    const passwords = new PasswordService();
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await expect(service.login("admin", "wrong-password")).rejects.toEqual(
      expect.objectContaining<Partial<UnauthorizedException>>({
        message: "Invalid username or password.",
      }),
    );
  });

  it("cleans stale refresh tokens in bounded, throttled batches", async () => {
    const passwords = {
      verifyPassword: vi.fn().mockResolvedValue(true),
    };
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      appUser: {
        findUnique: vi.fn().mockResolvedValue(user),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({ id: 10 }),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords as never);

    await service.login("admin", "admin@123");
    await service.login("admin", "admin@123");

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      500,
    );
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(2);
  });

  it("rate-limits concurrent password guesses by source and account", async () => {
    const passwords = {
      verifyPassword: vi.fn(async () => false),
    };
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue(user),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords as never);

    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        service.login("admin", "wrong-password", "192.0.2.15"),
      ),
    );

    expect(passwords.verifyPassword).toHaveBeenCalledTimes(5);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(6);
    const throttled = attempts.find(
      (attempt) =>
        attempt.status === "rejected" &&
        attempt.reason instanceof HttpException &&
        attempt.reason.getStatus() === 429,
    );
    expect(throttled).toBeDefined();
  });

  it("clears source and account throttles after a successful login", async () => {
    const passwords = {
      verifyPassword: vi.fn(async (_hash: string | null, password: string) =>
        password === "admin@123",
      ),
    };
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      appUser: {
        findUnique: vi.fn().mockResolvedValue(user),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({ id: 10 }),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords as never);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        service.login("admin", "wrong-password", "192.0.2.15"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(
      service.login("admin", "admin@123", "192.0.2.15"),
    ).resolves.toEqual(expect.objectContaining({ user: expect.objectContaining({ id: 1 }) }));
    await expect(
      service.login("admin", "wrong-password", "192.0.2.15"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("recovers a rotated replacement when a refresh response is lost", async () => {
    const passwords = new PasswordService();
    const refreshToken = "used-refresh-token";
    const replacementToken = derivedReplacement(refreshToken);
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue(user),
      },
      refreshToken: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 10,
            userId: user.id,
            revokedAt: null,
            rotatedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
            replacedByTokenId: 11,
          })
          .mockResolvedValueOnce({
            tokenHash: refreshTokenHash(replacementToken),
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        updateMany: vi.fn(),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await expect(service.refresh(refreshToken)).resolves.toEqual({
      accessToken: expect.any(String),
      refreshToken: replacementToken,
      user: expect.objectContaining({ id: user.id }),
    });

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
    });
  });

  it("rejects an already-revoked refresh token without walking its lineage", async () => {
    const passwords = new PasswordService();
    const prisma = {
      appUser: {
        findUnique: vi.fn(),
      },
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 10,
          userId: user.id,
          revokedAt: new Date(),
          rotatedAt: new Date(Date.now() - 60_000),
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: vi.fn(),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await expect(service.refresh("revoked-refresh-token")).rejects.toEqual(
      expect.objectContaining<Partial<UnauthorizedException>>({
        message: "Invalid refresh token.",
      }),
    );

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.appUser.findUnique).not.toHaveBeenCalled();
  });

  it("revokes a refresh-token lineage when reuse occurs outside the tab-race grace period", async () => {
    const passwords = new PasswordService();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: user.id }]),
      refreshToken: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ replacedByTokenId: 11 })
          .mockResolvedValueOnce({ replacedByTokenId: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      appUser: {
        findUnique: vi.fn(),
      },
      refreshToken: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 10,
            userId: user.id,
            revokedAt: null,
            rotatedAt: new Date(Date.now() - 60_000),
            expiresAt: new Date(Date.now() + 60_000),
          })
          .mockResolvedValueOnce({ userId: user.id }),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await expect(service.refresh("reused-refresh-token")).rejects.toEqual(
      expect.objectContaining<Partial<UnauthorizedException>>({
        message: "Invalid refresh token.",
      }),
    );

    expect(transaction.$queryRaw).toHaveBeenCalledWith(
      expect.anything(),
      user.id,
    );
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledTimes(2);
    expect(transaction.refreshToken.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 10, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.refreshToken.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 11, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("serializes refresh rotation on the user row", async () => {
    const passwords = new PasswordService();
    const existing = {
      id: 10,
      userId: user.id,
      revokedAt: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: user.id }]),
      refreshToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 11 }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      appUser: {
        findUnique: vi.fn().mockResolvedValue(user),
      },
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue(existing),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await expect(service.refresh("valid-refresh-token")).resolves.toEqual({
      accessToken: expect.any(String),
      refreshToken: derivedReplacement("valid-refresh-token"),
      user: expect.objectContaining({ id: user.id }),
    });

    expect(transaction.$queryRaw).toHaveBeenCalledWith(
      expect.anything(),
      user.id,
    );
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: existing.id,
        revokedAt: null,
        rotatedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: {
        rotatedAt: expect.any(Date),
        lastUsedAt: expect.any(Date),
      },
    });
  });

  it("recovers a refresh token rotated while waiting for the user lock", async () => {
    const passwords = new PasswordService();
    const refreshToken = "concurrent-refresh-token";
    const replacementToken = derivedReplacement(refreshToken);
    const existing = {
      id: 10,
      userId: user.id,
      revokedAt: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: user.id }]),
      refreshToken: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            revokedAt: null,
            rotatedAt: new Date(),
            replacedByTokenId: 11,
          })
          .mockResolvedValueOnce({
            tokenHash: refreshTokenHash(replacementToken),
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        create: vi.fn(),
      },
    };
    const prisma = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      appUser: {
        findUnique: vi.fn().mockResolvedValue(user),
      },
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue(existing),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await expect(service.refresh(refreshToken)).resolves.toEqual({
      accessToken: expect.any(String),
      refreshToken: replacementToken,
      user: expect.objectContaining({ id: user.id }),
    });
    expect(transaction.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { id: existing.id },
      select: {
        revokedAt: true,
        rotatedAt: true,
        replacedByTokenId: true,
      },
    });
    expect(transaction.refreshToken.create).not.toHaveBeenCalled();
  });

  it("serializes logout and revokes the rotated refresh-token lineage", async () => {
    const passwords = new PasswordService();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: user.id }]),
      refreshToken: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ replacedByTokenId: 11 })
          .mockResolvedValueOnce({ replacedByTokenId: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({ id: 10, userId: user.id }),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await service.logout("rotated-refresh-token");

    expect(transaction.$queryRaw).toHaveBeenCalledWith(
      expect.anything(),
      user.id,
    );
    expect(transaction.refreshToken.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 10, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(transaction.refreshToken.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 11, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("keeps the migrated account and configured password during bootstrap", async () => {
    const passwords = new PasswordService();
    const storedUser = {
      ...user,
      passwordHash: await passwords.hashPassword("admin@123"),
    };
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue(storedUser),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await service.onModuleInit();

    expect(prisma.appUser.findUnique).toHaveBeenCalledWith({
      where: { localAuthKey: "primary" },
    });
    expect(prisma.appUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.appUser.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("updates the stable local administrator when both configured identifiers change", async () => {
    process.env.LOCAL_AUTH_USERNAME = "release-admin";
    process.env.LOCAL_AUTH_EMAIL = "admin@example.com";
    const passwords = new PasswordService();
    const storedUser = {
      ...user,
      passwordHash: await passwords.hashPassword("admin@123"),
    };
    const transaction = {
      appUser: { update: vi.fn().mockResolvedValue(undefined) },
      refreshToken: { updateMany: vi.fn() },
    };
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue(storedUser),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await service.onModuleInit();

    expect(transaction.appUser.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        localAuthKey: "primary",
        username: "release-admin",
        email: "admin@example.com",
        passwordHash: storedUser.passwordHash,
      },
    });
    expect(transaction.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.appUser.create).not.toHaveBeenCalled();
  });

  it("revokes existing refresh tokens transactionally when the password changes", async () => {
    process.env.LOCAL_AUTH_PASSWORD = "new-admin-password";
    const passwords = new PasswordService();
    const storedUser = {
      ...user,
      passwordHash: await passwords.hashPassword("admin@123"),
    };
    const transaction = {
      appUser: { update: vi.fn().mockResolvedValue(undefined) },
      refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue(storedUser),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await service.onModuleInit();

    const updatedPasswordHash = transaction.appUser.update.mock.calls[0]?.[0]?.data
      ?.passwordHash as string;
    expect(await passwords.verifyPassword(updatedPasswordHash, "new-admin-password")).toBe(true);
    expect(transaction.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

function derivedReplacement(refreshToken: string): string {
  return createHmac("sha384", "test-refresh-token-rotation-secret")
    .update(`release-hub-refresh-token-replacement-v1:${refreshToken}`)
    .digest("base64url");
}

function refreshTokenHash(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}
