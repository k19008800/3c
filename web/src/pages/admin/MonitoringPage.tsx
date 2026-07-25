// ============================================================
// 3cloud (3C) — 监控告警管理页面
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from '../../lib/api';
import { useToast } from '../../hooks/use-toast';
import { Loader2, AlertTriangle, CheckCircle, XCircle, Bell, Settings, Eye, RefreshCw } from 'lucide-react';

// 监控指标类型
interface MonitoringMetric {
  type: string;
  value: number;
  timestamp: string;
}

// 告警规则
interface AlertRule {
  id: string;
  type: string;
  name: string;
  description?: string;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  duration?: number;
  silencePeriod?: number;
  createdAt: string;
  updatedAt: string;
}

// 告警事件
interface AlertEvent {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  escalated: boolean;
  resolved: boolean;
  createdAt: string;
}

// 监控统计
interface MonitoringStats {
  totalAlerts: number;
  unacknowledgedAlerts: number;
  criticalAlerts: number;
  warningAlerts: number;
  alertsByType: Array<{ type: string; count: number }>;
  recentAlertsTrend: Array<{ hour: string; count: number }>;
}

// 通知配置
interface NotificationConfig {
  id: string;
  name: string;
  emailEnabled: boolean;
  emailRecipients: string[];
  webhookEnabled: boolean;
  webhookUrl?: string;
  smsEnabled: boolean;
  smsPhoneNumbers: string[];
  pushEnabled: boolean;
  pushTokens: string[];
  updatedAt: string;
}

const MonitoringPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [metrics, setMetrics] = useState<MonitoringMetric[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [realTimeEnabled, setRealTimeEnabled] = useState(false);
  const { toast } = useToast();

  // 加载监控数据
  const loadMonitoringData = useCallback(async () => {
    setLoading(true);
    try {
      // 加载指标
      const metricsResponse = await api.get('/api/v1/admin/monitoring/metrics');
      setMetrics(metricsResponse.data.metrics || []);

      // 加载告警
      const alertsResponse = await api.get('/api/v1/admin/monitoring/alerts', {
        params: { limit: 20, acknowledged: false }
      });
      setAlerts(alertsResponse.data.alerts || []);

      // 加载规则
      const rulesResponse = await api.get('/api/v1/admin/monitoring/rules');
      setRules(rulesResponse.data.rules || []);

      // 加载统计
      const statsResponse = await api.get('/api/v1/admin/monitoring/stats');
      setStats(statsResponse.data);

      // 加载配置
      const configResponse = await api.get('/api/v1/admin/monitoring/notifications/config');
      setConfig(configResponse.data.config);
    } catch (error) {
      toast({
        title: '加载失败',
        description: '无法加载监控数据',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // 初始加载
  useEffect(() => {
    loadMonitoringData();
    
    // 设置定时刷新（每30秒）
    const interval = setInterval(() => {
      if (realTimeEnabled) {
        loadMonitoringData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [loadMonitoringData, realTimeEnabled]);

  // 确认告警
  const acknowledgeAlert = async (alertId: string) => {
    try {
      await api.post(`/api/v1/admin/monitoring/alerts/${alertId}/acknowledge`);
      toast({
        title: '操作成功',
        description: '告警已确认',
      });
      loadMonitoringData();
    } catch (error) {
      toast({
        title: '操作失败',
        description: '无法确认告警',
        variant: 'destructive',
      });
    }
  };

  // 切换规则状态
  const toggleRuleStatus = async (ruleId: string, enabled: boolean) => {
    try {
      await api.patch(`/api/v1/admin/monitoring/rules/${ruleId}`, {
        enabled: !enabled
      });
      toast({
        title: '操作成功',
        description: '规则状态已更新',
      });
      loadMonitoringData();
    } catch (error) {
      toast({
        title: '操作失败',
        description: '无法更新规则状态',
        variant: 'destructive',
      });
    }
  };

  // 测试通知渠道
  const testNotificationChannel = async (channel: 'email' | 'webhook' | 'sms' | 'push') => {
    try {
      await api.post(`/api/v1/admin/monitoring/notifications/test/${channel}`);
      toast({
        title: '测试成功',
        description: '通知渠道测试已发送',
      });
    } catch (error) {
      toast({
        title: '测试失败',
        description: '通知渠道测试失败',
        variant: 'destructive',
      });
    }
  };

  // 获取严重程度颜色
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // 获取指标类型名称
  const getMetricTypeName = (type: string) => {
    const typeMap: Record<string, string> = {
      'api_response_time': 'API响应时间',
      'api_error_rate': 'API错误率',
      'database_connection': '数据库连接',
      'redis_health': 'Redis健康',
      'disk_usage': '磁盘使用率',
      'memory_usage': '内存使用率'
    };
    return typeMap[type] || type;
  };

  // 准备图表数据
  const prepareChartData = () => {
    if (!stats?.recentAlertsTrend) return [];
    
    return stats.recentAlertsTrend.map(item => ({
      name: item.hour.split('T')[1].substring(0, 5),
      告警数量: item.count
    }));
  };

  const pieChartData = stats?.alertsByType.map(item => ({
    name: getMetricTypeName(item.type),
    value: item.count
  })) || [];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">监控告警系统</h1>
          <p className="text-muted-foreground">
            实时监控系统健康状态，及时发现和处理异常
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setRealTimeEnabled(!realTimeEnabled)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${realTimeEnabled ? 'animate-spin' : ''}`} />
            {realTimeEnabled ? '停止实时' : '开启实时'}
          </Button>
          <Button onClick={loadMonitoringData} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            刷新
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="alerts">告警事件</TabsTrigger>
          <TabsTrigger value="rules">告警规则</TabsTrigger>
          <TabsTrigger value="notifications">通知配置</TabsTrigger>
          <TabsTrigger value="metrics">实时指标</TabsTrigger>
        </TabsList>

        {/* 概览标签页 */}
        <TabsContent value="overview" className="space-y-6">
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总告警数</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalAlerts || 0}</div>
                <p className="text-xs text-muted-foreground">
                  其中未确认：{stats?.unacknowledgedAlerts || 0}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">紧急告警</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{stats?.criticalAlerts || 0}</div>
                <p className="text-xs text-muted-foreground">
                  需要立即处理
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">警告告警</CardTitle>
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{stats?.warningAlerts || 0}</div>
                <p className="text-xs text-muted-foreground">
                  需要注意处理
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">监控规则</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{rules.length}</div>
                <p className="text-xs text-muted-foreground">
                  {rules.filter(r => r.enabled).length} 个启用中
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>告警趋势</CardTitle>
                <CardDescription>最近24小时告警数量变化</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={prepareChartData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="告警数量" 
                        stroke="#8884d8" 
                        activeDot={{ r: 8 }} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>告警类型分布</CardTitle>
                <CardDescription>按监控类型统计</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 最新告警 */}
          <Card>
            <CardHeader>
              <CardTitle>最新告警</CardTitle>
              <CardDescription>最近触发的告警事件</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>严重程度</TableHead>
                    <TableHead>信息</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.slice(0, 5).map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">
                        {getMetricTypeName(alert.type)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(alert.severity)}>
                          {alert.severity === 'critical' ? '紧急' : 
                           alert.severity === 'warning' ? '警告' : '信息'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {alert.message}
                      </TableCell>
                      <TableCell>
                        {new Date(alert.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {alert.acknowledged ? (
                          <Badge variant="outline" className="bg-green-50">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            已确认
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            未确认
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!alert.acknowledged && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            确认
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {alerts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        暂无告警
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 告警事件标签页 */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>告警事件管理</CardTitle>
              <CardDescription>查看和管理所有告警事件</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>严重程度</TableHead>
                    <TableHead>信息</TableHead>
                    <TableHead>值/阈值</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="font-medium">
                        {getMetricTypeName(alert.type)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(alert.severity)}>
                          {alert.severity === 'critical' ? '紧急' : 
                           alert.severity === 'warning' ? '警告' : '信息'}
                        </Badge>
                      </TableCell>
                      <TableCell>{alert.message}</TableCell>
                      <TableCell>
                        {alert.value.toFixed(2)} / {alert.threshold}
                      </TableCell>
                      <TableCell>
                        {new Date(alert.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {alert.acknowledged ? (
                            <Badge variant="outline" className="bg-green-50">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              已确认
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-50">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              未确认
                            </Badge>
                          )}
                          {alert.escalated && (
                            <Badge variant="outline" className="bg-red-50">
                              已升级
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!alert.acknowledged && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => acknowledgeAlert(alert.id)}
                            >
                              确认
                            </Button>
                          )}
                          <Button size="sm" variant="ghost">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {alerts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        暂无告警事件
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 告警规则标签页 */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>告警规则配置</CardTitle>
              <CardDescription>配置系统监控规则和阈值</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>阈值</TableHead>
                    <TableHead>严重程度</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        <div>
                          {rule.name}
                          <div className="text-xs text-muted-foreground">
                            {rule.description}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getMetricTypeName(rule.type)}</TableCell>
                      <TableCell>{rule.threshold}</TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(rule.severity)}>
                          {rule.severity === 'critical' ? '紧急' : 
                           rule.severity === 'warning' ? '警告' : '信息'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {rule.enabled ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            启用
                          </Badge>
                        ) : (
                          <Badge variant="outline">禁用</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(rule.updatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleRuleStatus(rule.id, rule.enabled)}
                        >
                          {rule.enabled ? '禁用' : '启用'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 通知配置标签页 */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>通知配置</CardTitle>
              <CardDescription>配置告警通知渠道和接收方式</CardDescription>
            </CardHeader>
            <CardContent>
              {config ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 邮件通知 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Bell className="h-4 w-4" />
                          邮件通知
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">状态</span>
                            <Badge>
                              {config.emailEnabled ? '已启用' : '已禁用'}
                            </Badge>
                          </div>
                          {config.emailEnabled && (
                            <div>
                              <span className="text-sm font-medium">收件人</span>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {config.emailRecipients?.join(', ')}
                              </div>
                            </div>
                          )}
                          <Button
                            size="sm"
                            onClick={() => testNotificationChannel('email')}
                            disabled={!config.emailEnabled}
                          >
                            测试邮件
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Webhook通知 */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Bell className="h-4 w-4" />
                          Webhook通知
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">状态</span>
                            <Badge>
                              {config.webhookEnabled ? '已启用' : '已禁用'}
                            </Badge>
                          </div>
                          {config.webhookEnabled && config.webhookUrl && (
                            <div>
                              <span className="text-sm font-medium">URL</span>
                              <div className="mt-1 text-sm text-muted-foreground truncate">
                                {config.webhookUrl}
                              </div>
                            </div>
                          )}
                          <Button
                            size="sm"
                            onClick={() => testNotificationChannel('webhook')}
                            disabled={!config.webhookEnabled}
                          >
                            测试Webhook
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    最后更新：{new Date(config.updatedAt).toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  加载通知配置中...
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 实时指标标签页 */}
        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>实时监控指标</CardTitle>
              <CardDescription>系统当前各项指标状态</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {metrics.map((metric, index) => {
                  const isHealthy = metric.value < (metric.type.includes('usage') ? 90 : 1000);
                  const typeName = getMetricTypeName(metric.type);
                  
                  return (
                    <Card key={index}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">
                          {typeName}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {metric.value.toFixed(2)}
                          {metric.type.includes('usage') ? '%' : 
                           metric.type.includes('time') ? 'ms' : ''}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="text-sm text-muted-foreground">
                            {new Date(metric.timestamp).toLocaleTimeString()}
                          </div>
                          <div>
                            {isHealthy ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                正常
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                异常
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MonitoringPage;