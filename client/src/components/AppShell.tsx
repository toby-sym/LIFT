import type { ReactNode } from 'react'
import { Brand, Icon, type IconName } from './Studio'
import { useLocalDay } from './dates'

export type Page = 'today' | 'routines' | 'exercises' | 'progress' | 'history'
const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Overview', icon: 'overview' },
  { id: 'routines', label: 'Routines', icon: 'routine' },
  { id: 'exercises', label: 'Exercise library', icon: 'exercise' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
  { id: 'history', label: 'History', icon: 'history' },
]
const titles: Record<
  Page,
  { label: string; title: string; description: string }
> = {
  today: {
    label: 'OVERVIEW',
    title: 'Training overview',
    description: 'Your sessions, routines, and recent activity.',
  },
  routines: {
    label: 'TRAINING',
    title: 'Routines',
    description: 'Create and manage your training routines.',
  },
  exercises: {
    label: 'TRAINING',
    title: 'Exercise library',
    description: 'Browse and manage exercises.',
  },
  progress: {
    label: 'TRAINING DATA',
    title: 'Progress',
    description: 'Review your training history and measurements.',
  },
  history: {
    label: 'TRAINING',
    title: 'History',
    description: 'Review completed sessions.',
  },
}

export function AppShell({
  page,
  email,
  hasActive,
  busy,
  onNavigate,
  onNew,
  onSignOut,
  children,
  overlays,
}: {
  page: Page
  email: string
  hasActive: boolean
  busy: boolean
  onNavigate: (page: Page) => void
  onNew: () => void
  onSignOut: () => void
  children: ReactNode
  overlays: ReactNode
}) {
  const title = titles[page]
  const today = useLocalDay()
  function navigate(next: Page) {
    onNavigate(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-rail">
        <button
          onClick={() => navigate('today')}
          className="brand-lockup"
          aria-label="LIFT home"
        >
          <Brand />
        </button>
        <div className="rail-section-label">
          <span>WORKSPACE</span>
          <span>01</span>
        </div>
        <nav className="rail-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`rail-link ${page === item.id ? 'is-active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'today' && hasActive && (
                <span className="nav-live" aria-label="Workout in progress" />
              )}
              {page === item.id && <span className="rail-active-marker" />}
            </button>
          ))}
        </nav>
        <div className="rail-manifesto">
          <div className="manifesto-icon">
            <Icon name="bolt" size={23} />
          </div>
          <p>
            Training log.
            <br />
            <span>Made for you.</span>
          </p>
          <div className="manifesto-lines" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        </div>
        {hasActive && (
          <button className="rail-resume" onClick={() => navigate('today')}>
            <span className="live-badge">
              <i /> IN SESSION
            </span>
            <span>
              Back to your workout <Icon name="arrow" size={16} />
            </span>
          </button>
        )}
        <div className="rail-account">
          <span className="account-avatar">
            {email.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p>Your training space</p>
            <span className="account-email">{email}</span>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={onSignOut}
            disabled={busy}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="workspace-topbar">
          <button
            onClick={() => navigate('today')}
            className="brand-lockup mobile-brand"
            aria-label="LIFT home"
          >
            <Brand />
          </button>
          <div className="topbar-right">
            <span className="today-date">
              <Icon name="routine" size={15} />
              {today.toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'long',
              })}
            </span>
            <span className="topbar-divider" />
            <span className="topbar-status">
              <i /> {hasActive ? 'Session in progress' : 'No active session'}
            </span>
            <button
              className="mobile-signout icon-button"
              aria-label="Sign out"
              disabled={busy}
              onClick={onSignOut}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>
        <main id="main-content" className="page-wrap" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow page-eyebrow">{title.label}</p>
              <h1 className="page-title">{title.title}</h1>
              <p className="page-description">{title.description}</p>
            </div>
            <button className="button-quiet new-routine-button" onClick={onNew}>
              <Icon name="plus" size={17} /> New routine
            </button>
          </div>
          <div key={page} className="page-content">
            {children}
          </div>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            className={`mobile-nav-link ${page === item.id ? 'is-active' : ''}`}
            aria-current={page === item.id ? 'page' : undefined}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.id === 'exercises' ? 'Exercises' : item.label}</span>
          </button>
        ))}
      </nav>
      {overlays}
    </div>
  )
}
