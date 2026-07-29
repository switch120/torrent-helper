import { UnauthorizedException } from "@nestjs/common";
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
    delete process.env.LOCAL_AUTH_USERNAME;
    delete process.env.LOCAL_AUTH_PASSWORD;
    delete process.env.LOCAL_AUTH_EMAIL;
  });

  afterEach(() => {
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

  it("rejects a rotated refresh token without revoking its valid replacement", async () => {
    const passwords = new PasswordService();
    const prisma = {
      appUser: {
        findUnique: vi.fn(),
      },
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 10,
          userId: user.id,
          revokedAt: null,
          rotatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: vi.fn(),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await expect(service.refresh("used-refresh-token")).rejects.toEqual(
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
          .mockResolvedValueOnce({ replacedByTokenId: 11 })
          .mockResolvedValueOnce({ replacedByTokenId: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await expect(service.refresh("reused-refresh-token")).rejects.toEqual(
      expect.objectContaining<Partial<UnauthorizedException>>({
        message: "Invalid refresh token.",
      }),
    );

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.refreshToken.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 10, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenNthCalledWith(2, {
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
