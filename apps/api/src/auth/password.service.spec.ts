import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const service = new PasswordService();
    const hash = await service.hashPassword("admin@123");

    expect(hash).toMatch(/^scrypt\$[^$]+\$[^$]+$/);
    await expect(service.verifyPassword(hash, "admin@123")).resolves.toBe(true);
    await expect(service.verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("rejects absent and malformed hashes", async () => {
    const service = new PasswordService();

    await expect(service.verifyPassword(null, "admin@123")).resolves.toBe(false);
    await expect(service.verifyPassword("not-a-scrypt-hash", "admin@123")).resolves.toBe(false);
  });
});
