import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, CheckCircle, XCircle, FileCheck } from 'lucide-react';
import PaginationBar from '@/components/ui/PaginationBar';
import FeatureDescription from '@/components/admin/FeatureDescription';
import api from '@/lib/api';

interface Invoice {
  id: number;
  appliedAt: string;
  user: { id: number; email: string; name: string };
  amount: number;
  title: string;
  taxId: string;
  status: 'pending' | 'approved' | 'rejected' | 'issued';
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const statusLabels: Record<Invoice['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  issued: '已开票',
};

const statusColors: Record<Invoice['status'], string> = {
  pending: 'text-yellow-600 bg-yellow-50 ring-yellow-500/20',
  approved: 'text-green-600 bg-green-50 ring-green-500/20',
  rejected: 'text-red-600 bg-red-50 ring-red-500/20',
  issued: 'text-blue-600 bg-blue-50 ring-blue-500/20',
};

const AdminInvoices: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchInvoices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/api/v1/admin/finance/invoices', {
        params: { page, pageSize: 20, search },
      });
      setInvoices(res.data.data?.list ?? res.data.data ?? res.data.items ?? []);
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
    fetchInvoices(1);
  }, [fetchInvoices]);

  const handleAction = async (id: number, action: 'approve' | 'reject' | 'issue') => {
    setActionLoading(id);
    try {
      await api.post(`/api/v1/admin/finance/invoices/${id}/${action}`);
      fetchInvoices(pagination.page);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInvoices(1);
  };

  const handlePageChange = (page: number) => {
    fetchInvoices(page);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <FileText className="h-6 w-6 text-gray-700 mr-2" />
        <h1 className="text-2xl font-bold text-slate-900">发票审核</h1>
        <FeatureDescription page="admin/finance/invoices" className="ml-2" />
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
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">发票抬头</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">税号</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">加载中...</td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">暂无数据</td>
                </tr>
              ) : (
                invoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {invoice.appliedAt ? new Date(invoice.appliedAt).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="font-medium">{invoice.user?.name ?? '—'}</div>
                      <div className="text-gray-400 text-xs">{invoice.user?.email ?? '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right font-mono">
                      ¥{Number(invoice.amount || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 max-w-[200px] truncate">
                      {invoice.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">
                      {invoice.taxId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusColors[invoice.status]}`}>
                        {statusLabels[invoice.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        {invoice.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleAction(invoice.id, 'approve')}
                              disabled={actionLoading === invoice.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              审核通过
                            </button>
                            <button
                              onClick={() => handleAction(invoice.id, 'reject')}
                              disabled={actionLoading === invoice.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              拒绝
                            </button>
                          </>
                        )}
                        {invoice.status === 'approved' && (
                          <button
                            onClick={() => handleAction(invoice.id, 'issue')}
                            disabled={actionLoading === invoice.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            <FileCheck className="h-3.5 w-3.5" />
                            标记已开票
                          </button>
                        )}
                        {(invoice.status === 'rejected' || invoice.status === 'issued') && (
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

export default AdminInvoices;
