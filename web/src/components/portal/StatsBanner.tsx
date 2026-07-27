import { useEffect, useState } from 'react'
import { Cpu, Store, Users, Database } from 'lucide-react'

export default function StatsBanner() {
  const [stats, setStats] = useState({
    models: 130,
    vendors: 40,
    users: 813,
    totalTokens: 595893775,
  })

  useEffect(() => {
    fetch('/api/v1/public/stats')
      .then(r => r.json())
      .then(d => {
        if (d?.code === 0 && d?.data) {
          setStats(d.data)
        }
      })
      .catch(() => {})
  }, [])

  const fmtTokens = (t: number) => {
    if (t >= 1_000_000_000) return (t / 1_000_000_000).toFixed(1) + 'B'
    if (t >= 1_000_000) return (t / 1_000_000).toFixed(1) + 'M'
    if (t >= 1_000) return (t / 1_000).toFixed(1) + 'K'
    return String(t)
  }

  const items = [
    { icon: Cpu, value: `${stats.models}+`, label: 'AI 模型' },
    { icon: Store, value: `${stats.vendors}+`, label: '供应商' },
    { icon: Users, value: `${stats.users}+`, label: '注册用户' },
    { icon: Database, value: fmtTokens(stats.totalTokens), label: '累计 Token' },
  ]

  return (
    <section className="py-16 bg-gradient-to-r from-blue-600 to-indigo-600">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {items.map((stat) => (
            <div key={stat.label} className="text-white">
              <stat.icon size={28} className="mx-auto mb-3 text-blue-200" />
              <div className="text-3xl sm:text-4xl font-extrabold">{stat.value}</div>
              <div className="text-sm text-blue-200 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
