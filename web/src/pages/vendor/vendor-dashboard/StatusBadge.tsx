export default function StatusBadge({ status }: { status: string | boolean }) {
  const isActive = status === true || status === 'active'
  const isPending = status === 'pending'
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${
      isActive ? 'bg-green-100 text-green-700 border-green-200' :
      isPending ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
      'bg-red-100 text-red-700 border-red-200'
    }`}>
      {isActive ? '已激活' : isPending ? '待审核' : '已禁用'}
    </span>
  )
}
