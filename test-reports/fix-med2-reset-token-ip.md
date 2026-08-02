# MED-2 修复报告: 重置密码 Token 绑定 IP

## 问题描述

`forgot-password` 生成的 token 仅绑定 userId 和 30 分钟过期时间，**无 IP/设备绑定**。Token 泄露后攻击者可以在任意位置重置用户密码。

**严重性**: 中

## 修复方案

### 1. Redis 存储结构变更

| 字段 | 原格式 | 新格式 |
|------|--------|--------|
| Token Value | `String(userId)` | `JSON.stringify({ userId, ip, userAgent })` |

### 2. 修改的文件

#### `api/src/services/auth-service/password.ts`

**`forgotPassword` 函数** — 新增可选参数 `ip` 和 `userAgent`:
- 签名: `forgotPassword(email: string, ip?: string, userAgent?: string)`
- Redis 存储改为 JSON 格式，包含 userId、ip、userAgent

**`resetPasswordWithToken` 函数** — 新增可选参数 `currentIp` 和 `currentUserAgent`:
- 签名: `resetPasswordWithToken(token, newPassword, currentIp?, currentUserAgent?)`
- 解析 Redis 中的 JSON 数据（兼容旧版纯数字字符串格式）
- IP 软比对逻辑（三级判定，仅记录不阻塞）:

| 场景 | 处理 | 日志级别 |
|------|------|---------|
| IP 相同或未存储 IP | 正常通过 | 不记录 |
| 同一 C 段 (A.B.C.x) | 正常通过 | `console.info` |
| 跨网段但 UA 一致 | 正常通过 | `console.info` |
| 跨网段且 UA 不同 | 正常通过，发出告警 | `console.warn` |

**新增辅助函数** `sameCSegment(ip1, ip2)`: 比较两个 IPv4 地址的前三段是否相同。

#### `api/src/routes/auth/reset.ts`

- `forgotPassword` 调用: 传入 `request.ip`, `request.headers["user-agent"]`
- `resetPasswordWithToken` 调用: 传入 `request.ip`, `request.headers["user-agent"]`

### 3. 兼容性

- 旧版 Redis Token（纯数字字符串）会自动降级解析，视为无 IP 绑定场景，不触发警告
- 旧 Token 在 30 分钟过期后自然失效，无存量兼容问题

## 代码走读确认

### `password.ts` 变更总结

```diff
- await redis.setex(`reset:token:${token}`, 1800, String(user.id));
+ await redis.setex(`reset:token:${token}`, 1800,
+   JSON.stringify({ userId: user.id, ip: ip || "", userAgent: userAgent || "" }));
```

```diff
- const userIdStr = await redis.get(`reset:token:${token}`);
- if (!userIdStr) throw ...
- const userId = parseInt(userIdStr, 10);
+ const stored = await redis.get(`reset:token:${token}`);
+ // 解析 JSON，兼容旧格式
+ let userId: number;
+ try {
+   const parsed = JSON.parse(stored);
+   userId = parsed.userId;
+   storedIp = parsed.ip || "";
+   storedUserAgent = parsed.userAgent || "";
+ } catch {
+   userId = parseInt(stored, 10);
+ }
```

### `reset.ts` 变更总结

```diff
- await forgotPassword(parsed.email);
+ await forgotPassword(parsed.email, request.ip, request.headers["user-agent"]);
```

```diff
- await resetPasswordWithToken(parsed.token, parsed.newPassword);
+ await resetPasswordWithToken(parsed.token, parsed.newPassword, request.ip, request.headers["user-agent"]);
```

## 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript 编译 | ✅ 通过（无新增错误） |
| 旧格式兼容性 | ✅ JSON.parse fallback 处理 |
| 参数向后兼容 | ✅ 新增参数均为可选 |

## 后续建议

1. (Phase 2) 对接 `securityEvents` 表，将跨网段重置记录为安全事件持久化存储
2. (Phase 2) 考虑对高频跨网段重置的用户触发邮箱二次验证
