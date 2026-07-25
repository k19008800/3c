import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { AlertTriangle, RefreshCw, Eye, CheckCircle, Clock, User } from 'lucide-react';
import { format } from 'date-fns';

const SEVERITY_COLORS: Record<string, string> = { critical: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' };
const STATUS_COLORS: Record<string, string> = { pending: 'bg-orange-500', acknowledged: 'bg-blue-500', resolved: 'bg-green-500', ignored: 'bg-gray-500' };

interface Alert {
  id: number; alertType: string; alertTypeLabel: string; severity: string; severityLabel: string;
  userId: number; userEmail?: string; userNickname?: string;
  title: string; description: string; status: string; statusLabel: string;
  handledBy?: number; handledAt?: string; handleNote?: string;
  createdAt: string;
}

export default function OperationAlertsPage() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterType, setFilterType] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [handleOpen, setHandleOpen] = useState(false);
  const [handleAlertId, setHandleAlertId] = useState<number | null>(null);
  const [handleStatus, setHandleStatus] = useState<'acknowledged' | 'resolved' | 'ignored'>('acknowledged');
  const [handleNote, setHandleNote] = useState('');
  const pageSize = 20;

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
      if (filterType) params.set('alertType', filterType);
      if (filterSeverity) params.set('severity', filterSeverity);
      if (filterStatus) params.set('status', filterStatus);
      const res = await api.get(`/api/v1/admin/operation-alerts?${params}`);
      if (res.data.code === 0) {
        setAlerts(res.data.data.list);
        setTotal(res.data.data.total);
      }
    } catch { toast({ title: '加载失败', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAlerts(); }, [page, filterType, filterSeverity, filterStatus]);

  const viewDetail = async (id: number) => {
    try {
      const res = await api.get(`/api/v1/admin/operation-alerts/${id}`);
      if (res.data.code === 0) { setSelectedAlert(res.data.data); setDetailOpen(true); }
    } catch { toast({ title: '加载失败', variant: 'destructive' }); }
  };

  const handleAlertAction = async () => {
    if (!handleAlertId) return;
    try {
      await api.patch(`/api/v1/admin/operation-alerts/${handleAlertId}`, { status: handleStatus, handleNote });
      toast({ title: '已处理' });
      setHandleOpen(false);
      setHandleNote('');
      loadAlerts();
    } catch { toast({ title: '处理失败', variant: 'destructive' }); }
  };

  const triggerScan = async () => {
    try {
      const res = await api.post('/api/v1/admin/operation-alerts/scan');
      if (res.data.code === 0) {
        toast({ title: '扫描完成', description: `创建了 ${res.data.data.alertsCreated} 条告警` });
        loadAlerts();
      }
    } catch { toast({ title: '扫描失败', variant: 'destructive' }); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />异常操作告警
          </h1>
          <p className="text-muted-foreground mt-1">检测并告警异常操作行为</p>
        </div>
        <Button onClick={triggerScan} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />手动扫描
        </Button>
      </div>

      <div className="flex gap-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="告警类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部类型</SelectItem>
            <SelectItem value="frequent_failure">频繁失败</SelectItem>
            <SelectItem value="remote_login">异地登录</SelectItem>
            <SelectItem value="batch_delete">批量删除</SelectItem>
            <SelectItem value="sensitive_operation">敏感操作</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-40"><SelectValue placeholder="严重程度" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部程度</SelectItem>
            <SelectItem value="critical">严重</SelectItem>
            <SelectItem value="warning">警告</SelectItem>
            <SelectItem value="info">信息</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="处理状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部状态</SelectItem>
            <SelectItem value="pending">待处理</SelectItem>
            <SelectItem value="acknowledged">已确认</SelectItem>
            <SelectItem value="resolved">已解决</SelectItem>
            <SelectItem value="ignored">已忽略</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">告警</th>
                <th className="px-4 py-3 text-left text-sm font-medium">用户</th>
                <th className="px-4 py-3 text-left text-sm font-medium">严重程度</th>
                <th className="px-4 py-3 text-left text-sm font-medium">状态</th>
                <th className="px-4 py-3 text-left text-sm font-medium">时间</th>
                <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">加载中...</td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">暂无告警</td></tr>
              ) : alerts.map(a => (
                <tr key={a.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-sm text-muted-foreground">{a.alertTypeLabel}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {a.userNickname || a.userEmail || `用户 ${a.userId}`}
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge className={SEVERITY_COLORS[a.severity]}>{a.severityLabel}</Badge></td>
                  <td className="px-4 py-3"><Badge className={STATUS_COLORS[a.status]}>{a.statusLabel}</Badge></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-4 w-4" />{format(new Date(a.createdAt), 'MM-dd HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => viewDetail(a.id)}><Eye className="h-4 w-4" /></Button>
                      {a.status === 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => { setHandleAlertId(a.id); setHandleOpen(true); }}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 items-center">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">第 {page}/{totalPages} 页</span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>告警详情</DialogTitle></DialogHeader>
          {selectedAlert && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><div className="text-sm text-muted-foreground">类型</div><div className="font-medium">{selectedAlert.alert.alertTypeLabel}</div></div>
                <div><div className="text-sm text-muted-foreground">严重程度</div><Badge className={SEVERITY_COLORS[selectedAlert.alert.severity]}>{selectedAlert.alert.severityLabel}</Badge></div>
                <div><div className="text-sm text-muted-foreground">用户</div><div className="font-medium">{selectedAlert.user?.nickname || selectedAlert.user?.email || `用户${selectedAlert.alert.userId}`}</div></div>
                <div><div className="text-sm text-muted-foreground">时间</div><div className="font-medium">{format(new Date(selectedAlert.alert.createdAt), 'yyyy-MM-dd HH:mm:ss')}</div></div>
              </div>
              <div><div className="text-sm text-muted-foreground mb-1">描述</div><div className="p-3 bg-muted rounded-lg">{selectedAlert.alert.description}</div></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailOpen(false)}>关闭</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={handleOpen} onOpenChange={setHandleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>处理告警</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm mb-1">处理方式</div>
              <Select value={handleStatus} onValueChange={(v: any) => setHandleStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="acknowledged">已确认</SelectItem>
                  <SelectItem value="resolved">已解决</SelectItem>
                  <SelectItem value="ignored">已忽略</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-sm mb-1">处理备注</div>
              <Textarea value={handleNote} onChange={e => setHandleNote(e.target.value)} placeholder="备注..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHandleOpen(false)}>取消</Button>
            <Button onClick={handleAlertAction}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
