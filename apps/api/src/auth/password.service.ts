import { Injectable } from "@nestjs/common";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = "scrypt";

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("base64url");
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `${HASH_PREFIX}$${salt}$${derived.toString("base64url")}`;
  }

  async verifyPassword(passwordHash: string | null | undefined, password: string): Promise<boolean> {
    if (!passwordHash || !password) return false;

    const [prefix, salt, expectedText, ...remainder] = passwordHash.split("$");
    if (prefix !== HASH_PREFIX || !salt || !expectedText || remainder.length > 0) return false;

    try {
      const derived = (await scrypt(password, salt, 64)) as Buffer;
      const expected = Buffer.from(expectedText, "base64url");
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
}
