import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { WorkoutSession } from '../api'
import { dayKey, useLocalDay } from './dates'

export type IconName =
  | 'overview'
  | 'routine'
  | 'exercise'
  | 'progress'
  | 'history'
  | 'arrow'
  | 'plus'
  | 'play'
  | 'check'
  | 'close'
  | 'search'
  | 'clock'
  | 'bolt'
  | 'logout'
  | 'chevron'
  | 'target'
  | 'trophy'

const iconPaths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  routine: (
    <>
      <rect x="4" y="4" width="16" height="17" rx="3" />
      <path d="M8 2v4m8-4v4M4 10h16m-12 5h3m3 0h2m-8 3h3" />
    </>
  ),
  exercise: (
    <>
      <path d="m6 8 2-2 10 10-2 2zM4 6l2-2m12 16 2-2M3 11l8-8m2 18 8-8" />
    </>
  ),
  progress: (
    <>
      <path d="M4 4v16h17M8 14l4-5 4 2 5-7" />
    </>
  ),
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7m2-4v5l4 2" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="m9 5 11 7-11 7z" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7z" />,
  logout: (
    <>
      <path d="M10 4H5v16h5m-1-8h12m-4-4 4 4-4 4" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm4 11v6m-4 1h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4" />
    </>
  ),
}

export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {iconPaths[name]}
    </svg>
  )
}

export function Brand() {
  return (
    <>
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M8 5v22h19v-7H15V5H8Z" fill="currentColor" />
          <path d="M20 5h7v10h-7z" fill="currentColor" />
        </svg>
      </span>
      <span className="brand-word">
        LIFT<span className="brand-period">.</span>
      </span>
    </>
  )
}

export function CountUp({
  value,
  digits = 0,
}: {
  value: number
  digits?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return
    let frame: number
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / 900, 1)
      node.textContent = (
        value *
        (1 - Math.pow(1 - progress, 3))
      ).toLocaleString(undefined, { maximumFractionDigits: digits })
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, digits])
  return (
    <span
      aria-label={value.toLocaleString(undefined, {
        maximumFractionDigits: digits,
      })}
    >
      <span ref={ref} aria-hidden="true">
        {value.toLocaleString(undefined, { maximumFractionDigits: digits })}
      </span>
    </span>
  )
}

export function TrainingOrbit({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`training-orbit ${compact ? 'is-compact' : ''}`}
      aria-hidden="true"
    >
      <div className="orbit-halo" />
      <div className="orbit-ring orbit-ring-outer" />
      <div className="orbit-ring orbit-ring-middle" />
      <div className="orbit-core">
        <svg viewBox="0 0 100 100">
          <path d="M34 22v56h45V61H52V22H34Z" fill="currentColor" />
          <path d="M63 22h16v25H63z" fill="currentColor" />
        </svg>
      </div>
      <div className="orbit-track">
        <i />
        <i />
      </div>
      <span className="orbit-coordinate coordinate-a">TRAIN / TRACK</span>
      <span className="orbit-coordinate coordinate-b">LIFT</span>
    </div>
  )
}

export function StatCard({
  label,
  value,
  unit,
  caption,
  icon,
  tone = 'lime',
}: {
  label: string
  value: number
  unit?: string
  caption: string
  icon: IconName
  tone?: 'lime' | 'purple' | 'orange'
}) {
  return (
    <div className={`card studio-stat tone-${tone}`}>
      <div className="stat-top">
        <p className="eyebrow">{label}</p>
        <span className="stat-icon">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="studio-stat-value">
        <CountUp value={value} digits={unit === 'kg' ? 1 : 0} />
        {unit && <span>{unit}</span>}
      </p>
      <p className="metric-caption">{caption}</p>
      <div className="stat-accent" />
    </div>
  )
}

export function TrainingChart({ history }: { history: WorkoutSession[] }) {
  const [range, setRange] = useState<7 | 28>(7)
  const [selected, setSelected] = useState<string | null>(null)
  const today = useLocalDay()
  const days = Array.from({ length: range }, (_, i) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - range + i + 1,
    )
    const key = dayKey(date)
    const sessions = history.filter(
      (s) => s.completedAt && dayKey(new Date(s.completedAt)) === key,
    )
    return {
      date,
      key,
      sets: sessions.reduce(
        (sum, s) =>
          sum +
          s.exercises.reduce(
            (count, e) => count + e.sets.filter((set) => set.completed).length,
            0,
          ),
        0,
      ),
      sessions: sessions.length,
    }
  })
  const total = days.reduce((sum, d) => sum + d.sets, 0)
  const max = Math.max(...days.map((d) => d.sets), 5)
  const active = days.find((d) => d.key === selected)
  return (
    <section className="card training-chart">
      <div className="section-top">
        <div>
          <p className="eyebrow">THE WORK ADDS UP</p>
          <h2>Training activity</h2>
        </div>
        <div
          className="segmented-control"
          role="group"
          aria-label="Activity period"
        >
          {([7, 28] as const).map((n) => (
            <button
              key={n}
              aria-pressed={range === n}
              onClick={() => {
                setRange(n)
                setSelected(null)
              }}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>
      <div className="chart-summary">
        <span className="chart-total" key={range}>
          <CountUp value={total} />
        </span>
        <span>
          completed sets
          <br />
          <small>over the last {range} days</small>
        </span>
        <span className="chart-legend">
          <i /> Set volume
        </span>
      </div>
      <div
        className={`activity-chart ${range === 28 ? 'is-month' : ''}`}
        key={range}
      >
        <div className="chart-grid" aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map((n) => (
            <div key={n}>
              <span>{Math.round(max * n)}</span>
            </div>
          ))}
        </div>
        <div className="chart-bars">
          {days.map((d, i) => (
            <button
              className={`chart-bar ${d.key === dayKey(today) ? 'is-today' : ''} ${selected === d.key ? 'is-selected' : ''}`}
              key={d.key}
              aria-pressed={selected === d.key}
              aria-label={`${d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${d.sets} completed sets, ${d.sessions} workouts`}
              onClick={() => setSelected(d.key)}
              style={
                {
                  '--bar-height': `${Math.max(1.5, (d.sets / max) * 100)}%`,
                  '--i': i,
                } as CSSProperties
              }
            >
              <span className="bar-fill" />
              <span className="bar-label">
                {range === 7
                  ? d.date
                      .toLocaleDateString(undefined, { weekday: 'short' })
                      .slice(0, 1)
                  : i % 4 === 0
                    ? d.date.getDate()
                    : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="chart-detail" aria-live="polite">
        {active
          ? `${active.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · ${active.sets} completed sets across ${active.sessions} workout${active.sessions === 1 ? '' : 's'}`
          : total
            ? 'Select a day to explore your training.'
            : 'Your first completed workout starts the story.'}
      </p>
      <p className="chart-source">
        Based on your latest 30 completed workouts.
      </p>
    </section>
  )
}

export function ActivityCalendar({ history }: { history: WorkoutSession[] }) {
  const today = useLocalDay()
  const end = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + (6 - ((today.getDay() + 6) % 7)),
  )
  const days = Array.from({ length: 84 }, (_, i) => {
    const date = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() - 83 + i,
    )
    return {
      date,
      count: history.filter(
        (s) =>
          s.completedAt && dayKey(new Date(s.completedAt)) === dayKey(date),
      ).length,
    }
  })
  const active = days.filter((d) => d.count > 0).length
  return (
    <section className="card rhythm-card">
      <div className="section-top">
        <div>
          <p className="eyebrow">ACTIVITY</p>
          <h2>Training days</h2>
        </div>
        <Icon name="bolt" />
      </div>
      <p className="rhythm-caption">
        <strong>{active}</strong> visible training days · last 12 weeks
      </p>
      <div
        className="heatmap"
        role="img"
        aria-label={`${active} training days in the last 12 weeks, based on the latest 30 workouts`}
      >
        {days.map((day, i) => (
          <span
            key={dayKey(day.date)}
            className={`heatmap-day level-${Math.min(day.count, 3)} ${day.date > today ? 'is-future' : ''}`}
            style={{ '--i': i } as CSSProperties}
            title={`${day.date.toLocaleDateString()}: ${day.count} workouts`}
          />
        ))}
      </div>
      <div className="heatmap-key">
        <span>Latest 30 workouts.</span>
        <div>
          <span>Less</span>
          {[0, 1, 2, 3].map((level) => (
            <i key={level} className={`level-${level}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </section>
  )
}

export function Modal({
  children,
  onClose,
  label,
  wide = false,
}: {
  children: ReactNode
  onClose: () => void
  label: string
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`studio-dialog ${wide ? 'dialog-wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose()
        }
      }}
    >
      <span id={titleId} className="sr-only">
        {label}
      </span>
      {children}
    </dialog>
  )
}
