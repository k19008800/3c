import { useEffect, useState, useCallback } from 'react';
import { get, post } from '@/lib/api';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Activity,
  Database,
  Server,
  HardDrive,
  MemoryStick,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

// ──────────────────────────────────────────────
//  类型定义
// ──────────────────────────────────────────────

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: boolean; latency?: number; message?: string };
    redis: { status: boolean; latency?: number; message?: string };
    disk: { status: boolean; usedPercent?: number; message?: string };
    memory: { status: boolean; usedPercent?: number; message?: string };
  };
}

interface SystemMetrics {
  api: {
    p50: number;
    p95: number;
    p99: number;
    avgResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
  };
  database: {
    activeConnections: number;
    idleConnections: number;
    waitingCount: number;
    queryTime: number;
  };
  redis: {
    connectedClients: number;
    usedMemory: number;
    usedMemoryPeak: number;
    hitRate: number;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    uptime: number;
  };
}

interface Alert {
  id: string;
  type: 'api' | 'database' | 'redis' | 'disk' | 'memory' | 'error_rate';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  acknowledged: boolean;
}

interface AlertRule {
  id: string;
  type: string;
  threshold: number;
  severity: string;
  enabled: boolean;
}

// ──────────────────────────────────────────────
//  格式化工具
// ──────────────────────────────────────────────

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}天 ${hours}时 ${mins}分`;
};

const formatMemory = (bytes: number) => {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const formatTimestamp = (ts: string) => {
  const date = new Date(ts);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'warning':
      return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'info':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    default:
      return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'critical':
      return <XCircle className="w-4 h-4" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4" />;
    case 'info':
      return <AlertCircle className="w-4 h-4" />;
    default:
      return <AlertCircle className="w-4 h-4" />;
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'api':
      return 'API 响应';
    case 'database':
      return '数据库';
    case 'redis':
      return 'Redis';
    case 'disk':
      return '磁盘';
    case 'memory':
      return '内存';
    case 'error_rate':
      return '错误率';
    default:
      return type;
  }
};

// ──────────────────────────────────────────────
//  主组件
// ──────────────────────────────────────────────

export default function Monitoring() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [metricsHistory, setMetricsHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRulesModal, setShowRulesModal] = useState(false);

  // 获取所有数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [healthData, metricsData, alertsData, rulesData] = await Promise.all([
        get<HealthStatus>('/api/v1/admin/monitoring/health'),
        get<SystemMetrics>('/api/v1/admin/monitoring/metrics'),
        get<{ alerts: Alert[]; total: number }>('/api/v1/admin/monitoring/alerts', { limit: 50 }),
        get<AlertRule[]>('/api/v1/admin/monitoring/rules'),
      ]);

      setHealth(healthData);
      setMetrics(metricsData);
      setAlerts(alertsData?.alerts || []);
      setRules(rulesData || []);

      // 更新指标历史（用于图表）
      if (metricsData) {
        setMetricsHistory((prev) => {
          const newPoint = {
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            p50: metricsData.api.p50,
            p95: metricsData.api.p95,
            p99: metricsData.api.p99,
            errorRate: metricsData.api.errorRate,
            requestsPerMinute: metricsData.api.requestsPerMinute,
          };
          const updated = [...prev, newPoint];
          // 保留最近 60 个点
          return updated.slice(-60);
        });
      }
    } catch (err: any) {
      setError(err.message || '获取监控数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // 每 30 秒刷新一次
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // 确认告警
  const acknowledgeAlert = async (alertId: string) => {
    try {
      await post(`/api/v1/admin/monitoring/alerts/${alertId}/acknowledge`, {});
      fetchData();
    } catch (err: any) {
      alert(`确认失败: ${err.message}`);
    }
  };

  // 更新告警规则
  const updateRule = async (type: string, threshold: number, severity: string) => {
    try {
      await post('/api/v1/admin/monitoring/rules', { type, threshold, severity, enabled: true });
      fetchData();
    } catch (err: any) {
      alert(`更新失败: ${err.message}`);
    }
  };

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-slate-400" size={36} />
      </div>
    );
  }

  if (error && !health) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg text-sm">
        <AlertCircle size={18} />
        {error}
        <button
          onClick={fetchData}
          className="ml-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700"
        >
          重试
        </button>
      </div>
    );
  }

  const h = health!;
  const m = metrics!;

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">实时监控告警</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRulesModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            <Settings size={15} />
            告警规则
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {/* 系统健康状态 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 总体状态 */}
        <div
          className={`p-4 rounded-xl border-2 ${
            h.status === 'healthy'
              ? 'bg-green-50 border-green-200'
              : h.status === 'degraded'
                ? 'bg-orange-50 border-orange-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">系统状态</span>
            {h.status === 'healthy' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : h.status === 'degraded' ? (
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div className="text-2xl font-bold text-slate-900 capitalize">{h.status}</div>
          <div className="text-xs text-slate-500 mt-1">运行 {formatUptime(h.uptime)}</div>
        </div>

        {/* 数据库 */}
        <div
          className={`p-4 rounded-xl border ${
            h.checks.database.status ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">数据库</span>
            <Database className={h.checks.database.status ? 'text-green-500' : 'text-red-500'} size={18} />
          </div>
          <div className="text-lg font-semibold text-slate-900">
            {h.checks.database.status ? '正常' : '异常'}
          </div>
          {h.checks.database.latency && (
            <div className="text-xs text-slate-500 mt-1">延迟 {h.checks.database.latency}ms</div>
          )}
        </div>

        {/* Redis */}
        <div
          className={`p-4 rounded-xl border ${
            h.checks.redis.status ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">Redis</span>
            <Server className={h.checks.redis.status ? 'text-green-500' : 'text-red-500'} size={18} />
          </div>
          <div className="text-lg font-semibold text-slate-900">
            {h.checks.redis.status ? '正常' : '异常'}
          </div>
          {h.checks.redis.latency && (
            <div className="text-xs text-slate-500 mt-1">延迟 {h.checks.redis.latency}ms</div>
          )}
        </div>

        {/* 内存 */}
        <div
          className={`p-4 rounded-xl border ${
            h.checks.memory.status ? 'bg-white border-slate-200' : 'bg-orange-50 border-orange-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600">内存</span>
            <MemoryStick
              className={h.checks.memory.status ? 'text-green-500' : 'text-orange-500'}
              size={18}
            />
          </div>
          <div className="text-lg font-semibold text-slate-900">
            {h.checks.memory.usedPercent?.toFixed(1) || 0}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {h.checks.memory.status ? '使用正常' : '使用率过高'}
          </div>
        </div>
      </div>

      {/* 实时指标 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API 响应时间 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-base font-semibold text-slate-900 mb-4">API 响应时间</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-xs text-slate-500">P50</div>
              <div className="text-lg font-semibold text-slate-900">{m.api.p50.toFixed(0)}ms</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">P95</div>
              <div className="text-lg font-semibold text-orange-600">{m.api.p95.toFixed(0)}ms</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">P99</div>
              <div className="text-lg font-semibold text-red-600">{m.api.p99.toFixed(0)}ms</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-slate-500">平均</div>
              <div className="text-lg font-semibold text-slate-900">{m.api.avgResponseTime.toFixed(0)}ms</div>
            </div>
          </div>
          {metricsHistory.length > 1 && (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={metricsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Legend />
                <Line type="monotone" dataKey="p50" stroke="#3b82f6" strokeWidth={2} dot={false} name="P50" />
                <Line type="monotone" dataKey="p95" stroke="#f97316" strokeWidth={2} dot={false} name="P95" />
                <Line type="monotone" dataKey="p99" stroke="#ef4444" strokeWidth={2} dot={false} name="P99" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 请求量 & 错误率 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-base font-semibold text-slate-900 mb-4">请求量 & 错误率</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-xs text-slate-500 mb-1">每分钟请求</div>
              <div className="text-2xl font-bold text-blue-600">{m.api.requestsPerMinute}</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-xs text-slate-500 mb-1">错误率</div>
              <div className="text-2xl font-bold text-red-600">{m.api.errorRate.toFixed(2)}%</div>
            </div>
          </div>
          {metricsHistory.length > 1 && (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={metricsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Legend />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="requestsPerMinute"
                  stroke="#3b82f6"
                  fill="#dbeafe"
                  strokeWidth={2}
                  name="请求/分钟"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="errorRate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="错误率 %"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 数据库 & Redis 指标 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 数据库连接池 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-base font-semibold text-slate-900 mb-4">数据库连接池</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">活跃连接</span>
              <span className="text-lg font-semibold text-blue-600">{m.database.activeConnections}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">空闲连接</span>
              <span className="text-lg font-semibold text-green-600">{m.database.idleConnections}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">等待队列</span>
              <span className="text-lg font-semibold text-orange-600">{m.database.waitingCount}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">查询延迟</span>
              <span className="text-lg font-semibold text-slate-900">{m.database.queryTime}ms</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart
              data={[
                { name: '连接', active: m.database.activeConnections, idle: m.database.idleConnections },
              ]}
            >
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Bar dataKey="active" stackId="a" fill="#3b82f6" name="活跃" />
              <Bar dataKey="idle" stackId="a" fill="#22c55e" name="空闲" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Redis 状态 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Redis 状态</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">连接客户端</span>
              <span className="text-lg font-semibold text-blue-600">{m.redis.connectedClients}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">命中率</span>
              <span className="text-lg font-semibold text-green-600">{m.redis.hitRate.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">内存使用</span>
              <span className="text-lg font-semibold text-slate-900">{formatMemory(m.redis.usedMemory)}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">峰值内存</span>
              <span className="text-lg font-semibold text-slate-900">{formatMemory(m.redis.usedMemoryPeak)}</span>
            </div>
          </div>
          <div className="h-[120px] flex items-center justify-center">
            <div className="text-center">
              <div className="relative w-24 h-24 mx-auto">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="#e5e7eb"
                    strokeWidth="8"
                    fill="none"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="40"
                    stroke="#22c55e"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(m.redis.hitRate / 100) * 251.2} 251.2`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-slate-900">{m.redis.hitRate.toFixed(0)}%</span>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-2">缓存命中率</div>
            </div>
          </div>
        </div>
      </div>

      {/* 告警列表 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">告警记录</h3>
          <span className="text-sm text-slate-500">共 {alerts.length} 条</span>
        </div>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
            <p>暂无告警</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${getSeverityColor(alert.severity)} ${alert.acknowledged ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {getSeverityIcon(alert.severity)}
                  <div>
                    <div className="text-sm font-medium">{alert.message}</div>
                    <div className="text-xs opacity-75">
                      {getTypeLabel(alert.type)} · {formatTimestamp(alert.timestamp)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {alert.acknowledged ? (
                    <span className="text-xs text-slate-500">已确认</span>
                  ) : (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="px-2 py-1 text-xs bg-white rounded border hover:bg-slate-50"
                    >
                      确认
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 告警规则配置弹窗 */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">告警规则配置</h3>
              <button
                onClick={() => setShowRulesModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {rules.map((rule) => (
                <RuleEditor key={rule.id} rule={rule} onUpdate={updateRule} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
//  规则编辑器组件
// ──────────────────────────────────────────────

function RuleEditor({ rule, onUpdate }: { rule: AlertRule; onUpdate: (type: string, threshold: number, severity: string) => void }) {
  const [threshold, setThreshold] = useState(rule.threshold);
  const [severity, setSeverity] = useState(rule.severity);

  const handleSave = () => {
    onUpdate(rule.type, threshold, severity);
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-900">{getTypeLabel(rule.type)}</div>
        <div className="text-xs text-slate-500">当前阈值: {rule.threshold}</div>
      </div>
      <input
        type="number"
        value={threshold}
        onChange={(e) => setThreshold(Number(e.target.value))}
        className="w-24 px-2 py-1 text-sm border rounded"
      />
      <select
        value={severity}
        onChange={(e) => setSeverity(e.target.value)}
        className="px-2 py-1 text-sm border rounded"
      >
        <option value="critical">严重</option>
        <option value="warning">警告</option>
        <option value="info">提示</option>
      </select>
      <button onClick={handleSave} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
        保存
      </button>
    </div>
  );
}
