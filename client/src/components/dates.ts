import { useEffect, useState } from 'react'

export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function useLocalDay() {
  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date()
      setToday((previous) =>
        dayKey(previous) === dayKey(now) ? previous : now,
      )
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return today
}
