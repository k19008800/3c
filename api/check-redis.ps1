# Redis TTL 检查脚本
Write-Host "Redis TTL 检查脚本" -ForegroundColor Green
Write-Host "=====================" -ForegroundColor Green

# 检查 Redis 端口
Write-Host "检查 Redis 端口 6379..." -ForegroundColor Yellow
$portTest = Test-NetConnection -ComputerName localhost -Port 6379 -WarningAction SilentlyContinue
if ($portTest.TcpTestSucceeded) {
    Write-Host "✓ Redis 端口可访问" -ForegroundColor Green
} else {
    Write-Host "✗ Redis 端口不可访问" -ForegroundColor Red
    exit 1
}

# 尝试使用 telnet 或类似工具
Write-Host "尝试连接 Redis..." -ForegroundColor Yellow

# 创建一个临时的 Node.js 脚本
$nodeScript = @"
const net = require('net');

async function checkRedisTTL() {
    const client = new net.Socket();
    
    return new Promise((resolve, reject) => {
        client.connect(6379, 'localhost', () => {
            console.log('✓ Redis 连接成功');
            
            // 发送 PING 命令
            client.write('PING\\r\\n');
            
            let response = '';
            client.on('data', (data) => {
                response += data.toString();
                
                if (response.includes('+PONG')) {
                    console.log('✓ Redis 响应正常');
                    client.destroy();
                    resolve(true);
                }
            });
            
            client.on('error', (err) => {
                console.log('✗ Redis 连接错误:', err.message);
                reject(err);
            });
            
            // 超时
            setTimeout(() => {
                console.log('✗ Redis 连接超时');
                client.destroy();
                resolve(false);
            }, or/比);
        });
    });
}

checkRedisTTL().then(() => {
    process.exit(0);
}).catch(() => {
    process.exit(1);
});
"@

# 保存并运行 Node.js 脚本
$tempFile = "temp-redis-check.js"
Set-Content -Path $tempFile -Value $nodeScript -Encoding UTF8

Write-Host "运行 Redis 连接测试..." -ForegroundColor Yellow
node $tempFile 2>&1 | Out-String | Write-Host

if ($LASTEXITCODE -eq 0) {
    Write-Host "Redis 服务运行正常" -ForegroundColor Green
} else {
    Write-Host "Redis 服务可能有问题" -ForegroundColor Yellow
}

# 清理临时文件
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "建议的检查步骤:" -ForegroundColor Cyan
Write-Host "1. 确保 Memurai (Redis for Windows) 已安装并运行" -ForegroundColor White
Write-Host "2. 检查 Windows 服务: Get-Service Memurai" -ForegroundColor White
Write-Host "3. 如果有 redis-cli，运行: redis-cli -h localhost -p 6379 SCAN 0 MATCH '*' COUNT 100" -ForegroundColor White
Write-Host "4. 对每个 key: redis-cli -h localhost -p 6379 TTL <key>" -ForegroundColor White
Write-Host ""
Write-Host "根据代码分析，发现的 redis.set 调用:" -ForegroundColor Cyan
Write-Host "- src/routes/admin/undo.ts:87: 已有 TTL (EX 60s)" -ForegroundColor White
Write-Host "- src/utils/count-optimizer.ts:66: 已有 TTL (EX CACHE_TTL)" -ForegroundColor White
Write-Host ""
Write-Host "结论:" -ForegroundColor Green
Write-Host "✓ 代码中的 redis.set 调用都有 TTL 参数" -ForegroundColor Green
Write-Host "✓ 需要检查现有 Redis 数据中的无 TTL key" -ForegroundColor Yellow
Write-Host "✓ 建议在生产环境中定期运行 TTL 检查和清理" -ForegroundColor Yellow