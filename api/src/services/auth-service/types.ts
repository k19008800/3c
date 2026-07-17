// ============================================================
//  3cloud (3C) — Auth 服务层 — 类型定义
// ============================================================

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPayload {
  userId: number;
  role: string;
  impersonatorId?: number;
}

export interface AuthResult {
  user: {
    id: number;
    email: string;
    nickname: string | null;
    userType: "personal" | "enterprise";
    role: string;
    status: string;
    balance: string;
    emailVerifiedAt: string | null;
  };
  tokens: TokenPair;
}

export interface LoginResult {
  user: AuthResult["user"] | null;
  tokens: TokenPair | null;
  captchaRequired?: boolean;
  captchaSession?: string;
}
