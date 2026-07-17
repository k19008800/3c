import jwt from "jsonwebtoken";
import { config } from "../../config.js";
import { AppError, type TokenPayload, type TokenPair } from "./types.js";

export const ACCESS_EXPIRES_SECONDS = 2 * 3600;

export function generateTokens(userId: number, role: string): TokenPair {
  const accessToken = jwt.sign(
    { userId, role } satisfies TokenPayload,
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires as any }
  );
  const refreshToken = jwt.sign(
    { userId, role, type: "refresh" } satisfies TokenPayload & { type: string },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpires as any }
  );
  return { accessToken, refreshToken, expiresIn: ACCESS_EXPIRES_SECONDS };
}

export function verifyAccessToken(token: string): TokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
  return { userId: payload.userId, role: payload.role, impersonatorId: payload.impersonatorId };
}

export function verifyRefreshToken(token: string): TokenPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret) as TokenPayload & { type: string };
  if (payload.type !== "refresh") throw new AppError("INVALID_TOKEN", "Token 类型不正确", 401);
  return { userId: payload.userId, role: payload.role };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const payload = verifyRefreshToken(refreshToken);
  const accessToken = jwt.sign(
    { userId: payload.userId, role: payload.role } satisfies TokenPayload,
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpires as any }
  );
  return { accessToken, expiresIn: ACCESS_EXPIRES_SECONDS };
}
