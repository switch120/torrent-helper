import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionService } from "./auth-session.service";
import { PasswordService } from "./password.service";

describe("AuthSessionService", () => {
  const user = {
    id: 1,
    username: "admin",
    passwordHash: "",
    email: "switch120@gmail.com",
    name: "Scott Byers",
    pictureUrl: null,
  };

  beforeEach(() => {
    process.env.AUTH_ACCESS_TOKEN_SECRET = "test-release-hub-secret";
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

  it("keeps the migrated account and configured password during bootstrap", async () => {
    const passwords = new PasswordService();
    const storedUser = {
      ...user,
      passwordHash: await passwords.hashPassword("admin@123"),
    };
    const prisma = {
      appUser: {
        findFirst: vi.fn().mockResolvedValue(storedUser),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const service = new AuthSessionService(prisma as never, passwords);

    await service.onModuleInit();

    expect(prisma.appUser.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { username: "admin" },
          { email: "switch120@gmail.com" },
        ],
      },
    });
    expect(prisma.appUser.create).not.toHaveBeenCalled();
    expect(prisma.appUser.update).not.toHaveBeenCalled();
  });
});
