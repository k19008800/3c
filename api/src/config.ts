// ============================================================
//  3cloud (3C) — 配置模块
//  从环境变量读取，提供类型安全配置
// ============================================================

import "dotenv/config";

function parseOrigins(val: string | undefined): string | string[] {
  if (!val) return "http://localhost:5173";
  const parts = val.split(",").map(s => s.trim()).filter(Boolean);
  return parts.length === 1 ? parts[0] : parts;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: (process.env.NODE_ENV || "development") === "development",
  isProd: process.env.NODE_ENV === "production",

  server: {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
    accessExpires: process.env.JWT_ACCESS_EXPIRES || "2h",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
  },

  database: {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/threecloud",
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  vendorKeyEncryption: {
    key: process.env.VENDOR_KEY_ENCRYPTION_KEY || "",
  },

  appUrl: process.env.APP_URL || (process.env.CORS_ORIGIN || "http://localhost:5173").split(",")[0]?.trim() || "http://localhost:5173",

  cors: {
    origin: parseOrigins(process.env.CORS_ORIGIN),
  },

  upload: {
    dir: process.env.UPLOAD_DIR || "./uploads",
  },

  smtp: {
    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT || "1025", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "noreply@unmisa.com",
  },

  log: {
    level: process.env.LOG_LEVEL || "debug",
  },

  geoip: {
    dbPath: process.env.GEOIP_DB_PATH || "./data/GeoLite2-City.mmdb",
  },

  bcrypt: {
    saltRounds: 12,
  },
} as const;

// 生产环境强制校验 JWT secret，禁止使用不安全的默认值
if (process.env.NODE_ENV === "production") {
  if (
    !process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_SECRET === "dev-access-secret"
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET 未配置，生产环境禁止使用默认值"
    );
  }
  if (
    !process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_REFRESH_SECRET === "dev-refresh-secret"
  ) {
    throw new Error(
      "JWT_REFRESH_SECRET 未配置，生产环境禁止使用默认值"
    );
  }
}
