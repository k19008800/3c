# 前端页面遍历测试计划

## 测试目标
遍历前端所有页面，确保浏览器交互正常，不只看HTTP状态码，要snapshot验证页面内容。

## 测试方法
1. 使用browser自动化工具访问每个页面
2. 截图保存页面渲染状态
3. 检查页面关键元素是否存在
4. 验证交互功能是否正常

## 测试范围
基于现有路由配置，预计测试以下页面：

### 公开页面（无需登录）
1. 首页 `/`
2. 登录页 `/login`
3. 注册页 `/register`
4. 模型列表页 `/models`
5. 定价页面 `/pricing`
6. 文档页面 `/docs`
7. 帮助中心 `/help`

### 用户端页面（需要登录）
1. 用户控制台 `/console`
2. API Key管理 `/console/api-keys`
3. 余额和消费 `/console/balance`
4. 调用统计 `/console/stats`
5. 实名认证 `/console/real-name`
6. 用户设置 `/console/settings`

### 管理后台页面（需要管理员权限）
1. 管理仪表盘 `/console/admin`
2. 用户管理 `/console/admin/users`
3. 供应商管理 `/console/admin/vendors`
4. 模型管理 `/console/admin/models`
5. 代理商管理 `/console/admin/agents`
6. 财务管理 `/console/admin/finance`
7. 安全监控 `/console/admin/security`
8. 系统配置 `/console/admin/configs`
9. 审计日志 `/console/admin/logs`

## 测试步骤
1. **环境准备**：确保API和前端服务正常运行
2. **用户登录**：使用测试用户登录获取token
3. **页面遍历**：按顺序访问所有页面
4. **截图保存**：每个页面截图保存验证
5. **功能验证**：测试页面关键功能
6. **问题记录**：发现的问题立即记录并修复

## 测试数据准备
需要准备以下测试账号：
1. 普通用户账号
2. 代理商账号
3. 管理员账号

## 预期结果
所有页面应正常加载，无JavaScript错误，关键功能可用，UI渲染正常。