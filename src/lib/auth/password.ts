import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) throw new Error("password_too_short");
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}
