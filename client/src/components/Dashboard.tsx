import type { CSSProperties, ReactNode } from 'react'
import type { Routine, Stats, WorkoutSession } from '../api'
import {
  ActivityCalendar,
  Icon,
  StatCard,
  TrainingChart,
  TrainingOrbit,
} from './Studio'

export function Dashboard({
  routines,
  stats,
  history,
  active,
  busy,
  workout,
  onStart,
  onNew,
  onNavigate,
}: {
  routines: Routine[]
  stats: Stats
  history: WorkoutSession[]
  active: WorkoutSession | null
  busy: boolean
  workout: ReactNode
  onStart: (routine: Routine) => void
  onNew: () => void
  onNavigate: (page: 'routines' | 'history' | 'progress') => void
}) {
  if (active)
    return (
      <div className="workout-layout">
        <div className="min-w-0">{workout}</div>
        <aside className="workout-sidebar">
          <div className="card session-guide">
            <span className="live-badge">
              <i /> LIVE SESSION
            </span>
            <h2>Session notes</h2>
            <p>Completed sets are saved as you go.</p>
            <div className="session-guide-mark">
              <Icon name="target" size={96} />
            </div>
            <div className="session-guide-bottom">
              <Icon name="check" size={16} /> Your completed sets are saved.
            </div>
          </div>
          <ActivityCalendar history={history} />
        </aside>
      </div>
    )
  return (
    <div className="dashboard-grid">
      <section className="training-hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <span className="hero-label">
            <span /> TRAINING OVERVIEW
          </span>
          <h2>
            Your training,
            <br />
            <em>at a glance.</em>
          </h2>
          <p>
            Review recent sessions, track activity, and start a workout.
          </p>
          <div className="hero-actions">
            <button
              className="button-accent"
              disabled={busy}
              onClick={() => (routines.length ? onStart(routines[0]) : onNew())}
            >
              <Icon name={routines.length ? 'play' : 'plus'} size={17} />
              {routines.length ? 'Start a workout' : 'Create a routine'}
              <Icon name="arrow" size={18} />
            </button>
            {routines.length > 0 && (
              <button
                className="hero-secondary"
                onClick={() => onNavigate('routines')}
              >
                Explore routines <Icon name="chevron" size={15} />
              </button>
            )}
          </div>
        </div>
        <TrainingOrbit />
        <span className="hero-index" aria-hidden="true">
          01 — TRAINING
        </span>
      </section>
      <div className="stats-row">
        <StatCard
          label="Sets this week"
          value={stats.weeklySets}
          caption="Completed sets this week"
          icon="bolt"
        />
        <StatCard
          label="Workouts completed"
          value={stats.workouts}
          caption="Total completed sessions"
          icon="trophy"
          tone="purple"
        />
        <StatCard
          label="Routines in rotation"
          value={routines.length}
          caption="Available to start"
          icon="routine"
          tone="orange"
        />
      </div>
      <div className="dashboard-columns">
        <TrainingChart history={history} />
        <section className="card recent-card">
          <div className="section-top">
            <div>
              <p className="eyebrow">THE LATEST</p>
              <h2>Your recent sessions</h2>
            </div>
            <button
              className="icon-button"
              aria-label="View training history"
              onClick={() => onNavigate('history')}
            >
              <Icon name="arrow" />
            </button>
          </div>
          {history.length ? (
            <div className="recent-list">
              {history.slice(0, 3).map((s, i) => (
                <button
                  key={s.id}
                  className="recent-session"
                  onClick={() => onNavigate('history')}
                  style={{ '--i': i } as CSSProperties}
                >
                  <span
                    className={`session-icon tone-${i === 1 ? 'purple' : i === 2 ? 'orange' : 'lime'}`}
                  >
                    <Icon name="exercise" />
                  </span>
                  <span className="recent-session-copy">
                    <strong>{s.name}</strong>
                    <span>
                      {new Date(
                        s.completedAt ?? s.startedAt,
                      ).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      <i />{' '}
                      {s.exercises.reduce(
                        (n, e) => n + e.sets.filter((x) => x.completed).length,
                        0,
                      )}{' '}
                      sets
                    </span>
                  </span>
                  <Icon name="chevron" size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="mini-empty">
              <span>
                <Icon name="history" size={30} />
              </span>
              <h3>No sessions yet</h3>
              <p>
                Completed workouts will appear here.
              </p>
            </div>
          )}
          <button
            className="text-link recent-footer"
            onClick={() => onNavigate('progress')}
          >
            Explore your progress <Icon name="arrow" size={16} />
          </button>
        </section>
      </div>
      <div className="dashboard-columns">
        <section className="routine-preview">
          <div className="section-top">
            <div>
              <p className="eyebrow">ROUTINES</p>
              <h2>Your routines</h2>
            </div>
            <button
              className="text-link"
              onClick={() => onNavigate('routines')}
            >
              View all <Icon name="arrow" size={16} />
            </button>
          </div>
          {routines.length ? (
            <div className="routine-preview-list">
              {routines.slice(0, 3).map((r, i) => (
                <div className="routine-preview-row" key={r.id}>
                  <span className="routine-number">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{r.name}</h3>
                    <p>
                      {r.exercises.length} movements <span>·</span>{' '}
                      {r.exercises.reduce((n, e) => n + e.sets, 0)} sets
                    </p>
                  </div>
                  <button
                    className="round-play"
                    disabled={busy}
                    aria-label={`Start ${r.name}`}
                    onClick={() => onStart(r)}
                  >
                    <Icon name="play" size={18} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button className="create-routine-tile" onClick={onNew}>
              <span>
                <Icon name="plus" size={24} />
              </span>
              <div>
                <strong>No routines yet</strong>
                <p>Choose your movements and make a plan.</p>
              </div>
              <Icon name="arrow" />
            </button>
          )}
        </section>
        <ActivityCalendar history={history} />
      </div>
      <footer className="studio-footer">
        <span>
          LIFT <b>/</b> <span>TRAINING LOG</span>
        </span>
        <span>Sessions, activity, and progress.</span>
      </footer>
    </div>
  )
}
