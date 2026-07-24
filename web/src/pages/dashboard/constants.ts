import { TimeRange } from './types'

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: '今日',
  week: '本周',
  month: '本月',
}

function getDateRange(range: TimeRange): { startDate: string; endDate: string } {
  const now = new Date()
  const endDate = now.toISOString().slice(0, 10)

  if (range === 'today') {
    return { startDate: endDate, endDate }
  }

  const start = new Date(now)
  if (range === 'week') {
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    start.setDate(now.getDate() - mondayOffset)
  } else {
    start.setDate(1)
  }
  return { startDate: start.toISOString().slice(0, 10), endDate }
}

export { TIME_RANGE_LABELS, getDateRange }