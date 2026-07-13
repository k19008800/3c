import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function CTASection() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
          立即开始使用 3Cloud
        </h2>
        <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto">
          免费注册即可获得体验额度，开始您的 AI 接入之旅
        </p>
        <div className="mt-8">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-lg shadow-blue-600/25"
          >
            免费注册
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}
