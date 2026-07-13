import { useEffect, useState } from 'react'
import axios from 'axios'
import { Cpu, Store, Users } from 'lucide-react'

interface ModelItem {
  id: number
  name: string
  type: string
  vendors: { vendorId: number; vendorName: string }[]
}

const STATIC_STATS = {
  users: '200+',
  suppliers: '6+',
}

export default function StatsBanner() {
  const [modelCount, setModelCount] = useState(46)

  useEffect(() => {
    axios
      .get('/api/v1/models')
      .then((res) => {
        const list = res.data?.data?.list || res.data?.list || []
        if (list.length > 0) setModelCount(list.length)
      })
      .catch(() => {
        // Keep default static count
      })
  }, [])

  const stats = [
    { icon: Cpu, value: `${modelCount}+`, label: 'AI 模型' },
    { icon: Store, value: STATIC_STATS.suppliers, label: '供应商' },
    { icon: Users, value: STATIC_STATS.users, label: '注册用户' },
  ]

  return (
    <section className="py-16 bg-gradient-to-r from-blue-600 to-indigo-600">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-3 gap-8 text-center">
          {stats.map((stat) => (
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
