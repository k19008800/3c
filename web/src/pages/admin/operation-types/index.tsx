import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { format } from 'date-fns';

interface OperationType {
  id: number;
  name: string;
  category: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

const CATEGORY_OPTIONS = [
  { value: 'auth', label: '认证' },
  { value: 'api', label: 'API管理' },
  { value: 'finance', label: '财务' },
  { value: 'system', label: '系统' },
];

export default function OperationTypesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OperationType | null>(null);
  const [form, setForm] = useState({ name: '', category: 'auth', description: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('keyword', search);
      if (categoryFilter) params.set('category', categoryFilter);
      const res = await api.get(`/api/v1/admin/operation-types?${params}`);
      if (res.data.code === 0) setItems(res.data.data);
    } catch {
      toast({ title: '加载失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, categoryFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', category: 'auth', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (item: OperationType) => {
    setEditing(item);
    setForm({ name: item.name, category: item.category, description: item.description || '' });
    setDialogOpen(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await api.patch(`/api/v1/admin/operation-types/${editing.id}`, form);
      } else {
        await api.post('/api/v1/admin/operation-types', form);
      }
      setDialogOpen(false);
      load();
      toast({ title: editing ? '已更新' : '已创建' });
    } catch {
      toast({ title: '保存失败', variant: 'destructive' });
    }
  };

  const toggleEnabled = async (item: OperationType) => {
    try {
      await api.patch(`/api/v1/admin/operation-types/${item.id}`, { enabled: !item.enabled });
      load();
    } catch {
      toast({ title: '操作失败', variant: 'destructive' });
    }
  };

  const doDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/api/v1/admin/operation-types/${deleteConfirm}`);
      setDeleteConfirm(null);
      load();
      toast({ title: '已删除' });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">操作类型管理</h1>
          <p className="text-muted-foreground mt-1">自定义操作类型分类与配置</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />新建类型</Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索名称..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="全部分类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部分类</SelectItem>
            {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">名称</th>
                <th className="px-4 py-3 text-left text-sm font-medium">分类</th>
                <th className="px-4 py-3 text-left text-sm font-medium">描述</th>
                <th className="px-4 py-3 text-left text-sm font-medium">状态</th>
                <th className="px-4 py-3 text-left text-sm font-medium">创建时间</th>
                <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">加载中...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td></tr>
              ) : items.map(item => (
                <tr key={item.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{CATEGORY_OPTIONS.find(c => c.value === item.category)?.label || item.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.description || '-'}</td>
                  <td className="px-4 py-3">
                    <Switch checked={item.enabled} onCheckedChange={() => toggleEnabled(item)} />
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {format(new Date(item.createdAt), 'yyyy-MM-dd')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(item.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 创建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? '编辑操作类型' : '新建操作类型'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-sm mb-1">名称</div>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：login" />
            </div>
            <div>
              <div className="text-sm mb-1">分类</div>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-sm mb-1">描述</div>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="操作说明" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={save} disabled={!form.name}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <p>确定要删除此操作类型吗？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button variant="destructive" onClick={doDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
