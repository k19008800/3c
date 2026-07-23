/**
 * VirtualScrollDemo - 虚拟滚动演示组件
 * 
 * 用于测试和演示虚拟滚动的性能提升效果
 */

import React, { useState, useCallback } from 'react';
import { VirtualList } from './VirtualList';
import VirtualTable from './VirtualTable';

interface DemoItem {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

// 生成测试数据
const generateTestData = (count: number): DemoItem[] => {
  const roles = ['管理员', '用户', '开发者', '访客', '测试员'];
  const statuses = ['激活', '禁用', '待审核', '已删除'];
  
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `用户 ${index + 1}`,
    email: `user${index + 1}@example.com`,
    role: roles[Math.floor(Math.random() * roles.length)],
    status: statuses[Math.floor(Math.random() * statuses.length)],
    createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * from 1000).toISOString()
  }));
};

export default function VirtualScrollDemo() {
  const [dataCount, setDataCount] = useState(1000);
  const [showVirtual, setShowVirtual] = useState(true);
  const [renderTime, setRenderTime] = useState<number | null>(null);
  const [domNodes, setDomNodes] = useState<number | null>(null);
  
  const testData = generateTestData(dataCount);
  
  const columns = [
    { key: 'id', label: 'ID', width: '80px' },
    { key: 'name', label: '姓名' },
    { key: 'email', label: '邮箱' },
    { key: 'role', label: '角色' },
    { key: 'status', label: '状态' },
    { key: 'createdAt', label: '创建时间' },
  ];
  
  const measurePerformance = useCallback(() => {
    // 测量渲染时间
    const start = performance.now();
    
    // 触发强制重新渲染
    setShowVirtual(!showVirtual);
    
    // 使用 setTimeout 确保 DOM 已更新
    setTimeout(() => {
      const end = performance.now();
      setRenderTime(end - start);
      
      // 计算 DOM 节点数（仅统计列表部分）
      const listContainer = document.querySelector('[data-test="virtual-demo"]');
      if (listContainer) {
        const nodeCount = listContainer.querySelectorAll('*').length;
        setDomNodes(nodeCount);
      }
    }, 0);
  }, [showVirtual]);
  
  const renderRow = useCallback((item: DemoItem) => (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-600">{item.id}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.name}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{item.email}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
          item.role === '管理员' ? 'bg-purple-100 text-purple-700' :
          item.role === '开发者' ? 'bg-blue-100 text-blue-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {item.role}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
          item.status === '激活' ? 'bg-green-100 text-green-700' :
          item.status === '禁用' ? 'bg-red-100 text-red-700' :
          item.status === '待审核' ? 'bg-yellow-100 text-yellow-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {item.status}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {new Date(item.createdAt).toLocaleDateString()}
      </td>
    </tr>
  ), []);
  
  return (
    <div className="p-6 space-y-6" data-test="virtual-demo">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">虚拟滚动性能演示</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">测试配置</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  数据条数: {dataCount.toLocaleString()}
                </label>
                <input
                  type="range"
                  min="100"
                  max="10000"
                  step="100"
                  value={dataCount}
                  onChange={(e) => setDataCount(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>100</span>
                  <span>1,000</span>
                  <span>5,000</span>
                  <span>10,000</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVirtual(true)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition ${
                    showVirtual
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  虚拟滚动
                </button>
                <button
                  onClick={() => setShowVirtual(false)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition ${
                    !showVirtual
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  传统渲染
                </button>
              </div>
              
              <button
                onClick={measurePerformance}
                className="w-full px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
              >
                性能测试
              </button>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">性能指标</h3>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500">渲染时间</div>
                <div className="text-lg font-semibold text-gray-900">
                  {renderTime ? `${renderTime.toFixed(2)} ms` : '未测试'}
                </div>
                <div className="text-xs text-gray-400">
                  {renderTime && (renderTime < 100 ? '✅ 优秀' : renderTime < Panel 300 ? '⚠️ 良好' : '❌ 需优化')}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-gray-500">DOM 节点数</div>
                <div className="text-lg font-semibold text-gray-900">
                  {domNodes ? domNodes.toLocaleString() : '未测试'}
                </div>
                <div className="text-xs text-gray-400">
                  {domNodes && (domNodes < 1000 ? '✅ 优秀' : domNodes < 5000 ? '⚠️ 良好' : '❌ 需优化')}
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">性能对比</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">内存使用</span>
                <span className="text-sm font-medium">
                  {showVirtual ? '降低 60-80%' : '高'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">初始渲染</span>
                <span className="text-sm font-medium">
                  {showVirtual ? '快 5-10倍' : '慢'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">滚动 FPS</span>
                <span className="text-sm font-medium">
                  {showVirtual ? '60fps' : '<30fps'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">CPU 占用</span>
                <span className="text-sm font-medium">
                  {showVirtual ? '低' : '高'}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {showVirtual ? '虚拟滚动模式' : '传统渲染模式'} ({dataCount.toLocaleString()} 条数据)
          </h3>
          
          {showVirtual ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <VirtualTable
                data={testData}
                columns={columns}
                renderRow={renderRow}
                rowHeight={48}
                containerHeight={500}
                tableId="virtual-demo"
              />
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {columns.map(col => (
                        <th key={col.key} className="px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {testData.map(item => renderRow(item))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">实施建议</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-700 mb-2">何时使用虚拟滚动</h4>
            <ul className="space-y-1 text-sm text-blue-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>列表数据超过 100 条</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>需要流畅的滚动体验</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>移动端或低性能设备</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>大数据量实时更新</span>
              </li>
            </ul>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-green-700 mb-2">性能优化技巧</h4>
            <ul className="space-y-1 text-sm text-green-600">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                <span>合理设置 itemSize（固定高度）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                <span>使用适当的 overscan（预渲染行数）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                <span>避免在渲染函数中创建新对象</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                <span>使用 React.memo 优化组件</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}