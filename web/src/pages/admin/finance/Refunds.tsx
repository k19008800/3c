import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Search, CheckCircle, XCircle } from 'lucide-react';
import PaginationBar from '@/components/ui/PaginationBar';
import FeatureDescription from '@/components/admin/FeatureDescription';
import api from '@/lib/api';

interface Refund {
  id: number;
  appliedAt: string;
  user: { id: number; email: string; name: string };
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const statusLabels: Record<Refund['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

const statusColors: Record<Refund['status'], string> = {
  pending: 'text-yellow-600 bg-yellow-50 ring-yellow-500/20',
  approved: 'text-green-600 bg-green-50 ring-green-500/20',
  rejected: 'text-red-600 bg-red-50 ring-red-500/20',
};

const AdminRefunds: React.FC = () => {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchRefunds = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/admin/finance/refunds', {
        params: { page, pageSize: 20, search },
      });
      setRefunds(res.data.data?.list ?? res.data.data ?? res.data.items ?? []);
      if (res.data.data?.pagination || res.data.data?.meta) {
        setPagination(res.data.data.pagination ?? res.data.data.meta);
      } else if (res.data.data && typeof res.data.data.total === 'number') {
        setPagination({ page: res.data.data.page, pageSize: res.data.data.pageSize, total: res.data.data.total, totalPages: Math.ceil(res.data.data.total / (res.data.data.pageSize || 20)) });
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchRefunds(1);
  }, [fetchRefunds]);

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    setActionLoading(id);
    try {
      await api.post(`/api/v1/admin/finance/refunds/${id}/${action}`);
      fetchRefunds(pagination.page);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRefunds(1);
  };

  const handlePageChange = (page: number) => {
    fetchRefunds(page);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <RotateCcw className="h-6 w-6 text-gray-700 mr-2" />
        <h1 className="text-2xl font-bold text-slate-900">退款审核</h1>
        <FeatureDescription page="admin/finance/refunds" className="ml-2" />
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索用户邮箱或名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          搜索
        </button>
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申请时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">退款金额</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">原因</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">加载中...</td>
                </tr>
              ) : refunds.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">暂无数据</td>
                </tr>
              ) : (
                refunds.map(refund => (
                  <tr key={refund.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {new Date(refund.appliedAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="font-medium">{refund.user?.name ?? '—'}</div>
                      <div className="text-gray-400 text-xs">{refund.user?.email ?? '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right font-mono">
                      ¥{Number(refund.amount || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-[240px] truncate">
                      {refund.reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusColors[refund.status]}`}>
                        {statusLabels[refund.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        {refund.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleAction(refund.id, 'approve')}
                              disabled={actionLoading === refund.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              确认退款
                            </button>
                            <button
                              onClick={() => handleAction(refund.id, 'reject')}
                              disabled={actionLoading === refund.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              拒绝
                            </button>
                          </>
                        )}
                        {(refund.status === 'approved' || refund.status === 'rejected') && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination.totalPages > 1 && (
        <PaginationBar
          page={pagination.page}
          total={pagination.total}
          totalPages={pagination.totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
};

export default AdminRefunds;
