import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, CheckCircle, XCircle, FileCheck } from 'lucide-react';
import PaginationBar from '@/components/ui/PaginationBar';
import FeatureDescription from '@/components/admin/FeatureDescription';
import api, { get, post } from '@/lib/api';

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
  const [issueModal, setIssueModal] = useState<{ id: number; invoiceNo: string; file: File | null } | null>(null);

  const fetchInvoices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const data = await get<{ list: Invoice[]; page: number; pageSize: number; total: number }>(
        '/api/v1/admin/finance/invoices',
        { page, pageSize: 20, search }
      );
      setInvoices(data.list ?? []);
      setPagination({
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
        totalPages: Math.ceil(data.total / (data.pageSize || 20)),
      });
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchInvoices(1);
  }, [fetchInvoices]);

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    setActionLoading(id);
    try {
      await post(`/api/v1/admin/finance/invoices/${id}/${action}`);
      fetchInvoices(pagination.page);
    } finally {
      setActionLoading(null);
    }
  };

  const handleIssue = async () => {
    if (!issueModal) return;
    setActionLoading(issueModal.id);
    try {
      const formData = new FormData();
      if (issueModal.invoiceNo) formData.append('invoiceNo', issueModal.invoiceNo);
      if (issueModal.file) formData.append('invoiceFile', issueModal.file);
      await post(`/api/v1/admin/finance/invoices/${issueModal.id}/issue`, formData);
      fetchInvoices(pagination.page);
      setIssueModal(null);
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
                            onClick={() => setIssueModal({ id: invoice.id, invoiceNo: '', file: null })}
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

      {/* 开票弹窗 */}
      {issueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">标记已开票</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">发票号码</label>
                <input
                  type="text"
                  value={issueModal.invoiceNo}
                  onChange={e => setIssueModal({ ...issueModal, invoiceNo: e.target.value })}
                  placeholder="请输入发票号码"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">发票附件（PDF/图片）</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setIssueModal({ ...issueModal, file: e.target.files?.[0] ?? null })}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {issueModal.file && (
                  <p className="mt-1 text-xs text-gray-500">已选择: {issueModal.file.name}</p>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIssueModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleIssue}
                  disabled={actionLoading === issueModal.id}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  确认开票
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInvoices;
