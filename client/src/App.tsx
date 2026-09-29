import { useEffect, useState, type FormEvent } from 'react'
import {
  ApiError,
  json,
  request,
  type BodyweightEntry,
  type ExerciseDefinition,
  type ExerciseKind,
  type ExerciseProgress,
  type Routine,
  type RoutineInput,
  type Stats,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutSetInput,
} from './api'

import { AppShell, type Page } from './components/AppShell'
import { Dashboard } from './components/Dashboard'
import {
  ActivityCalendar,
  Brand,
  CountUp,
  Icon,
  Modal,
  TrainingOrbit,
} from './components/Studio'
type Account = { email: string }

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

const localDateInput = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const durationLabel = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function LiveDuration({ seconds }: { seconds: number }) {
  const [elapsed, setElapsed] = useState(seconds)
  useEffect(() => {
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [])
  return <>{durationLabel(elapsed)}</>
}

function App() {
  const [account, setAccount] = useState<Account | null>(null)
  const [checking, setChecking] = useState(true)
  const [startupError, setStartupError] = useState(false)
  const [page, setPage] = useState<Page>('today')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [active, setActive] = useState<WorkoutSession | null>(null)
  const [history, setHistory] = useState<WorkoutSession[]>([])
  const [stats, setStats] = useState<Stats>({
    workouts: 0,
    weeklySets: 0,
    bests: [],
    personalRecords: [],
    sessionTonnageRecordKg: null,
  })
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseDefinition[]>(
    [],
  )
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightEntry[]>(
    [],
  )
  const [editing, setEditing] = useState<Routine | 'new' | null>(null)
  const [editingExercise, setEditingExercise] = useState<
    ExerciseDefinition | 'new' | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function loadData() {
    const [
      nextRoutines,
      nextActive,
      nextHistory,
      nextStats,
      nextExercises,
      nextBodyweight,
    ] = await Promise.all([
      request<Routine[]>('/api/routines'),
      request<WorkoutSession | null>('/api/sessions/active'),
      request<WorkoutSession[]>('/api/sessions/history'),
      request<Stats>('/api/stats'),
      request<ExerciseDefinition[]>('/api/exercises'),
      request<BodyweightEntry[]>('/api/bodyweight'),
    ])
    setRoutines(nextRoutines)
    setActive(nextActive)
    setHistory(nextHistory)
    setStats(nextStats)
    setExerciseLibrary(nextExercises)
    setBodyweightEntries(nextBodyweight)
  }

  useEffect(() => {
    request<Account>('/api/me')
      .then(async (me) => {
        setAccount(me)
        await loadData()
      })
      .catch((cause) => {
        if (!(cause instanceof ApiError && cause.status === 401))
          setStartupError(true)
        setAccount(null)
      })
      .finally(() => setChecking(false))
  }, [])

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function signedIn() {
    setAccount(await request<Account>('/api/me'))
    await loadData()
    setPage('today')
  }

  async function signOut() {
    await run(async () => {
      await request<null>('/api/auth/logout', { method: 'POST' })
      setAccount(null)
      setActive(null)
      setRoutines([])
      setHistory([])
      setExerciseLibrary([])
      setBodyweightEntries([])
    })
  }

  async function saveRoutine(input: RoutineInput) {
    await run(async () => {
      const current = editing
      await request<Routine>(
        current && current !== 'new'
          ? `/api/routines/${current.id}`
          : '/api/routines',
        {
          method: current && current !== 'new' ? 'PUT' : 'POST',
          body: json(input),
        },
      )
      await loadData()
      setEditing(null)
      setPage('routines')
    })
  }

  async function saveExercise(input: {
    name: string
    kind: ExerciseKind
    oneRepMaxKg: number | null
  }) {
    await run(async () => {
      const current = editingExercise
      await request<ExerciseDefinition>(
        current && current !== 'new'
          ? `/api/exercises/${current.id}`
          : '/api/exercises',
        {
          method: current && current !== 'new' ? 'PUT' : 'POST',
          body: json(input),
        },
      )
      await loadData()
      setEditingExercise(null)
    })
  }

  async function deleteExercise(exercise: ExerciseDefinition) {
    if (
      !window.confirm(
        `Remove “${exercise.name}” from your exercise library? Routine and history names will be kept.`,
      )
    )
      return
    await run(async () => {
      await request<null>(`/api/exercises/${exercise.id}`, { method: 'DELETE' })
      await loadData()
    })
  }

  async function saveBodyweight(
    id: string | null,
    value: { weightKg: number; measuredOn: string },
  ) {
    await request<BodyweightEntry>(
      id ? `/api/bodyweight/${id}` : '/api/bodyweight',
      {
        method: id ? 'PUT' : 'POST',
        body: json(value),
      },
    )
    await loadData()
  }

  async function deleteBodyweight(entry: BodyweightEntry) {
    if (
      !window.confirm(
        `Delete the ${entry.weightKg} kg entry from ${entry.measuredOn}?`,
      )
    )
      return
    await run(async () => {
      await request<null>(`/api/bodyweight/${entry.id}`, { method: 'DELETE' })
      await loadData()
    })
  }

  async function deleteRoutine(routine: Routine) {
    if (
      !window.confirm(
        `Delete “${routine.name}”? Your workout history will stay saved.`,
      )
    )
      return
    await run(async () => {
      await request<null>(`/api/routines/${routine.id}`, { method: 'DELETE' })
      await loadData()
    })
  }

  async function startWorkout(routine: Routine) {
    await run(async () => {
      await request<WorkoutSession>('/api/sessions', {
        method: 'POST',
        body: json({ routineId: routine.id }),
      })
      await loadData()
      setPage('today')
    })
  }

  async function chooseExercise(
    sessionId: string,
    workoutExerciseId: string,
    exerciseId: string,
  ) {
    const exercise = active?.exercises.find(
      (item) => item.id === workoutExerciseId,
    )
    if (
      exercise?.exerciseId &&
      exercise.exerciseId !== exerciseId &&
      !window.confirm(
        'Changing this choice clears saved sets and discards unsaved entries for this slot. Continue?',
      )
    )
      return
    const clearLoggedSets = Boolean(
      exercise?.sets.some(
        (set) =>
          set.completed ||
          set.weightKg !== null ||
          set.reps !== null ||
          set.rpe !== null ||
          set.rir !== null ||
          set.actualTempo !== null ||
          set.durationSeconds !== null ||
          set.heartRateBpm !== null ||
          set.resistanceLevel !== null ||
          set.rpm !== null,
      ),
    )
    await run(async () => {
      setActive(
        await request<WorkoutSession>(
          `/api/sessions/${sessionId}/exercises/${workoutExerciseId}/choice`,
          {
            method: 'PUT',
            body: json({ exerciseId, clearLoggedSets }),
          },
        ),
      )
    })
  }

  async function saveSet(
    sessionId: string,
    setId: string,
    value: WorkoutSetInput,
  ) {
    await run(async () => {
      setActive(
        await request<WorkoutSession>(
          `/api/sessions/${sessionId}/sets/${setId}`,
          {
            method: 'PUT',
            body: json(value),
          },
        ),
      )
    })
  }

  async function saveNotes(sessionId: string, notes: string) {
    await run(async () => {
      await request<null>(`/api/sessions/${sessionId}/notes`, {
        method: 'PUT',
        body: json({ notes }),
      })
      await loadData()
    })
  }

  async function finishWorkout(
    sessionId: string,
    notes: string,
    rating: number | null,
    ratingNote: string,
  ) {
    await run(async () => {
      if (notes !== active?.notes) {
        await request<null>(`/api/sessions/${sessionId}/notes`, {
          method: 'PUT',
          body: json({ notes }),
        })
      }
      await request<null>(`/api/sessions/${sessionId}/rating`, {
        method: 'PUT',
        body: json({ rating, note: ratingNote }),
      })
      await request<WorkoutSession>(`/api/sessions/${sessionId}/finish`, {
        method: 'POST',
      })
      await loadData()
      setPage('history')
      setNotice('Session complete. Another step forward.')
    })
  }

  async function discardWorkout(sessionId: string) {
    if (!window.confirm('Discard this workout and its logged sets?')) return
    await run(async () => {
      await request<null>(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      await loadData()
    })
  }

  if (checking)
    return (
      <div className="loading-screen">
        <div className="loading-brand">
          <Brand />
        </div>
        <div className="loading-track">
          <span />
        </div>
        <p>Getting your training space ready</p>
      </div>
    )
  if (startupError)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-2xl font-black">Could not connect to LIFT</h1>
          <p className="mt-3 text-sm text-muted">
            Check that the API and database are running, then try again.
          </p>
          <button
            className="button-primary mt-6"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </div>
    )
  if (!account) return <AuthScreen onSignedIn={signedIn} />

  return (
    <AppShell
      page={page}
      email={account.email}
      hasActive={Boolean(active)}
      busy={busy}
      onNavigate={setPage}
      onNew={() => {
        setError('')
        setEditing('new')
      }}
      onSignOut={signOut}
      overlays={
        <>
          {notice && (
            <div className="success-toast" role="status">
              <span>
                <Icon name="check" size={18} />
              </span>
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {editing && (
            <RoutineEditor
              routine={editing === 'new' ? null : editing}
              busy={busy}
              error={error}
              library={exerciseLibrary}
              onClose={() => {
                setEditing(null)
                setError('')
              }}
              onSave={saveRoutine}
            />
          )}
          {editingExercise && (
            <ExerciseEditor
              exercise={editingExercise === 'new' ? null : editingExercise}
              busy={busy}
              error={error}
              onClose={() => {
                setEditingExercise(null)
                setError('')
              }}
              onSave={saveExercise}
            />
          )}
        </>
      }
    >
      {error && !editing && !editingExercise && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      {page === 'today' && (
        <TodayPage
          active={active}
          routines={routines}
          stats={stats}
          history={history}
          busy={busy}
          onNavigate={setPage}
          onStart={startWorkout}
          onNew={() => setEditing('new')}
          onSaveSet={saveSet}
          onSaveNotes={saveNotes}
          onChooseExercise={chooseExercise}
          onFinish={finishWorkout}
          onDiscard={discardWorkout}
        />
      )}
      {page === 'routines' && (
        <RoutinesPage
          routines={routines}
          busy={busy}
          hasActive={Boolean(active)}
          onStart={startWorkout}
          onEdit={setEditing}
          onDelete={deleteRoutine}
          onNew={() => setEditing('new')}
        />
      )}
      {page === 'exercises' && (
        <ExercisesPage
          exercises={exerciseLibrary}
          onNew={() => setEditingExercise('new')}
          onEdit={setEditingExercise}
          onDelete={deleteExercise}
        />
      )}
      {page === 'progress' && (
        <ProgressPage
          stats={stats}
          entries={bodyweightEntries}
          exercises={exerciseLibrary}
          history={history}
          onSave={saveBodyweight}
          onDelete={deleteBodyweight}
        />
      )}
      {page === 'history' && <HistoryPage history={history} />}
    </AppShell>
  )
}

function AuthScreen({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'register')
        await request<unknown>('/register', {
          method: 'POST',
          body: json({ email, password }),
        })
      await request<unknown>('/login?useCookies=true', {
        method: 'POST',
        body: json({ email, password }),
      })
      await onSignedIn()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-art">
        <div className="auth-grid" />
        <div className="brand-lockup">
          <Brand />
        </div>
        <div className="auth-statement">
          <span className="hero-label">
            <span /> A SPACE FOR YOUR STRONGER SELF
          </span>
          <h1>
            Show up.
            <br />
            <em>Level up.</em>
            <br />
            Go again.
          </h1>
          <p>
            Turn intention into progress.
            <br />
            Your training deserves a place like this.
          </p>
        </div>
        <TrainingOrbit />
        <div className="auth-art-footer">
          <span>BUILT BY EFFORT. DEFINED BY YOU.</span>
          <span>EST. 2026 ↗</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-label">
          <Icon name="target" size={16} />
          <span>YOUR PERSONAL TRAINING STUDIO</span>
        </div>
        <form onSubmit={submit} className="auth-form">
          <p className="eyebrow mb-3">Welcome to LIFT</p>
          <h2 className="text-3xl font-black tracking-tight">
            {mode === 'login' ? 'Sign in' : 'Create an account'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {mode === 'login'
              ? 'Pick up where you left off.'
              : 'Start building your training history.'}
          </p>
          {error && (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-red-400/10 p-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}
          <label className="mt-7 block text-sm font-semibold">
            Email address
            <input
              className="field mt-2"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="mt-5 block text-sm font-semibold">
            Password
            <input
              className="field mt-2"
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
          </label>
          {mode === 'register' && (
            <p className="mt-2 text-xs text-muted">
              Use 8+ characters with uppercase, lowercase, number and symbol.
            </p>
          )}
          <button className="button-primary mt-7 w-full" disabled={busy}>
            {busy
              ? 'One moment…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
          <p className="mt-6 text-center text-sm text-muted">
            {mode === 'login' ? 'New to LIFT?' : 'Already have an account?'}{' '}
            <button
              type="button"
              className="font-bold text-ink underline underline-offset-4"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
        <p className="auth-footnote">
          <span /> Your routines. Your records. All in one place.
        </p>
      </section>
    </div>
  )
}

function TodayPage({
  active,
  routines,
  stats,
  history,
  busy,
  onStart,
  onNew,
  onNavigate,
  onSaveSet,
  onSaveNotes,
  onChooseExercise,
  onFinish,
  onDiscard,
}: {
  active: WorkoutSession | null
  routines: Routine[]
  stats: Stats
  history: WorkoutSession[]
  busy: boolean
  onStart: (routine: Routine) => void
  onNew: () => void
  onNavigate: (page: Page) => void
  onSaveSet: (sessionId: string, setId: string, value: WorkoutSetInput) => void
  onSaveNotes: (sessionId: string, notes: string) => void
  onChooseExercise: (
    sessionId: string,
    workoutExerciseId: string,
    exerciseId: string,
  ) => void
  onFinish: (
    id: string,
    notes: string,
    rating: number | null,
    ratingNote: string,
  ) => void
  onDiscard: (id: string) => void
}) {
  return (
    <Dashboard
      routines={routines}
      stats={stats}
      history={history}
      active={active}
      busy={busy}
      onStart={onStart}
      onNew={onNew}
      onNavigate={onNavigate}
      workout={
        active && (
          <WorkoutPanel
            key={active.id}
            session={active}
            busy={busy}
            onSaveSet={onSaveSet}
            onSaveNotes={onSaveNotes}
            onChooseExercise={onChooseExercise}
            onFinish={onFinish}
            onDiscard={onDiscard}
          />
        )
      }
    />
  )
}

function WorkoutPanel({
  session,
  busy,
  onSaveSet,
  onSaveNotes,
  onChooseExercise,
  onFinish,
  onDiscard,
}: {
  session: WorkoutSession
  busy: boolean
  onSaveSet: (sessionId: string, setId: string, value: WorkoutSetInput) => void
  onSaveNotes: (sessionId: string, notes: string) => void
  onChooseExercise: (
    sessionId: string,
    workoutExerciseId: string,
    exerciseId: string,
  ) => void
  onFinish: (
    id: string,
    notes: string,
    rating: number | null,
    ratingNote: string,
  ) => void
  onDiscard: (id: string) => void
}) {
  const [notes, setNotes] = useState(session.notes)
  const [rating, setRating] = useState(session.rating?.toString() ?? '')
  const [ratingNote, setRatingNote] = useState(session.ratingNote)
  const completed = session.exercises
    .flatMap((x) => x.sets)
    .filter((x) => x.completed).length
  const total = session.exercises.reduce((sum, x) => sum + x.sets.length, 0)
  const displayGroups: {
    groupId: string | null
    groupType: WorkoutSession['exercises'][number]['groupType']
    exercises: WorkoutSession['exercises']
    indexes: number[]
  }[] = []
  const groupsById = new Map<string, (typeof displayGroups)[number]>()
  session.exercises.forEach((exercise, index) => {
    if (!exercise.groupId) {
      displayGroups.push({
        groupId: null,
        groupType: null,
        exercises: [exercise],
        indexes: [index],
      })
      return
    }
    let group = groupsById.get(exercise.groupId)
    if (!group) {
      group = {
        groupId: exercise.groupId,
        groupType: exercise.groupType,
        exercises: [],
        indexes: [],
      }
      groupsById.set(exercise.groupId, group)
      displayGroups.push(group)
    }
    group.exercises.push(exercise)
    group.indexes.push(index)
  })

  const exerciseCard = (
    exercise: WorkoutSession['exercises'][number],
    index: number,
  ) => (
    <div
      id={`workout-exercise-${exercise.id}`}
      className="card workout-exercise scroll-mt-6 p-5 md:p-6"
      key={exercise.id}
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-paper text-xs font-black">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div>
          <h3 className="text-lg font-black">{exercise.slotName}</h3>
          <p className="mt-1 text-xs font-semibold capitalize text-muted">
            {exercise.section === 'warmup'
              ? 'Warm-up'
              : exercise.section === 'cooldown'
                ? 'Cool-down'
                : 'Working sets'}
            {exercise.targetTempo
              ? ` · Target tempo ${exercise.targetTempo}`
              : ''}
            {exercise.oneRepMaxKg
              ? ` · Entered 1RM ${exercise.oneRepMaxKg} kg`
              : ''}
            {exercise.kind === 'cardio' &&
            exercise.targetHeartRateMin != null &&
            exercise.targetHeartRateMax != null
              ? ` · Target HR ${exercise.targetHeartRateMin}–${exercise.targetHeartRateMax} bpm`
              : ''}
            {exercise.kind === 'cardio' &&
            exercise.targetResistanceLevel != null
              ? ` · Target resistance ${exercise.targetResistanceLevel}`
              : ''}
            {exercise.kind === 'cardio' && exercise.targetRpm != null
              ? ` · Target ${exercise.targetRpm} RPM`
              : ''}
            {exercise.exerciseId && exercise.name !== exercise.slotName
              ? ` · Using ${exercise.name}`
              : ''}
          </p>
        </div>
      </div>
      {exercise.options.length > 1 && (
        <label className="mb-4 block max-w-md text-xs font-semibold text-muted">
          Choose your exercise for this workout
          <select
            className="field mt-1"
            value={exercise.exerciseId ?? ''}
            onChange={(event) => {
              if (event.target.value)
                onChooseExercise(session.id, exercise.id, event.target.value)
            }}
            disabled={busy}
          >
            <option value="" disabled>
              Select an option
            </option>
            {exercise.options.map((option) => (
              <option key={option.id} value={option.exerciseId ?? ''}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!exercise.exerciseId && (
        <p className="mb-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
          Choose an exercise option to unlock set logging.
        </p>
      )}
      <div className="space-y-2">
        {exercise.sets.map((set) => (
          <SetRow
            key={`${exercise.exerciseId}:${set.id}:${set.weightKg}:${set.reps}:${set.rpe}:${set.rir}:${set.actualTempo}:${set.durationSeconds}:${set.heartRateBpm}:${set.resistanceLevel}:${set.rpm}:${set.completed}`}
            set={set}
            kind={exercise.kind}
            oneRepMaxKg={exercise.oneRepMaxKg}
            targetHeartRateMin={exercise.targetHeartRateMin}
            targetHeartRateMax={exercise.targetHeartRateMax}
            targetResistanceLevel={exercise.targetResistanceLevel}
            targetRpm={exercise.targetRpm}
            busy={busy}
            disabled={!exercise.exerciseId}
            onSave={(value) => onSaveSet(session.id, set.id, value)}
          />
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="session-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-accent">
              Workout in progress <span className="session-live-dot" />
            </p>
            <h2 className="text-3xl font-black tracking-tight">
              {session.name}
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Started {dateLabel(session.startedAt)} ·{' '}
              <LiveDuration seconds={session.durationSeconds} />
            </p>
          </div>
          <div className="session-completion">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="27" />
              <circle
                cx="32"
                cy="32"
                r="27"
                pathLength="100"
                strokeDasharray="100"
                strokeDashoffset={100 - (total ? (completed / total) * 100 : 0)}
              />
            </svg>
            <span>
              <strong>
                {completed}
                <small>/{total}</small>
              </strong>
              <span>sets complete</span>
            </span>
          </div>
        </div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-white/75">
          <span>{session.metrics.totalReps} total reps</span>
          <span>
            Tonnage:{' '}
            {session.metrics.tonnageKg == null
              ? '—'
              : `${session.metrics.tonnageKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg${!session.metrics.tonnageComplete ? ' · partial' : ''}`}
          </span>
        </div>
      </div>
      <div className="workout-tools">
        <span>
          <Icon name="exercise" size={16} /> {session.exercises.length}{' '}
          movements · Make every set count
        </span>
        <RestTimer />
      </div>
      {displayGroups.map((group) =>
        group.groupId ? (
          <section
            className="rounded-2xl border border-accent/50 bg-paper p-3 md:p-4"
            key={group.groupId}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-2">
              <div>
                <p className="eyebrow">{group.groupType ?? 'Exercise group'}</p>
                <p className="mt-1 text-xs text-muted">
                  Alternate between these movements. Save each set before
                  switching.
                </p>
              </div>
              <nav
                className="flex flex-wrap gap-2"
                aria-label={`${group.groupType ?? 'Exercise'} navigation`}
              >
                {group.exercises.map((exercise, index) => (
                  <a
                    className="button-quiet !px-3 !py-2"
                    href={`#workout-exercise-${exercise.id}`}
                    key={exercise.id}
                  >
                    {String(group.indexes[index] + 1).padStart(2, '0')} ·{' '}
                    {exercise.slotName}
                  </a>
                ))}
              </nav>
            </div>
            <div className="mt-2 space-y-3">
              {group.exercises.map((exercise, index) =>
                exerciseCard(exercise, group.indexes[index]),
              )}
            </div>
          </section>
        ) : (
          exerciseCard(group.exercises[0], group.indexes[0])
        ),
      )}
      <div className="card p-5 md:p-6">
        <label className="block text-sm font-bold" htmlFor="workout-notes">
          Workout notes
        </label>
        <textarea
          id="workout-notes"
          className="field mt-3 min-h-28 resize-y"
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How did it feel?"
        />
        <button
          className="button-quiet mt-3"
          disabled={busy || notes === session.notes}
          onClick={() => onSaveNotes(session.id, notes)}
        >
          Save notes
        </button>
      </div>
      <div className="card grid gap-4 p-5 md:grid-cols-[200px_minmax(0,1fr)] md:items-end">
        <label className="block text-sm font-bold">
          Session rating{' '}
          <span className="font-normal text-muted">(optional)</span>
          <select
            className="field mt-2"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
          >
            <option value="">Skip rating</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option value={value} key={value}>
                {value} / 5
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold">
          Session reflection{' '}
          <span className="font-normal text-muted">(optional)</span>
          <input
            className="field mt-2"
            maxLength={500}
            value={ratingNote}
            onChange={(event) => setRatingNote(event.target.value)}
            placeholder="Energy, mood, anything to remember"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="button-accent"
          disabled={busy || completed === 0}
          onClick={() =>
            onFinish(
              session.id,
              notes,
              rating === '' ? null : Number(rating),
              ratingNote,
            )
          }
        >
          Finish workout
        </button>
        <button
          className="px-3 py-2 text-sm font-semibold text-muted hover:text-red-300"
          disabled={busy}
          onClick={() => onDiscard(session.id)}
        >
          Discard workout
        </button>
      </div>
    </div>
  )
}

function SetRow({
  set,
  kind,
  oneRepMaxKg,
  targetHeartRateMin,
  targetHeartRateMax,
  targetResistanceLevel,
  targetRpm,
  busy,
  disabled,
  onSave,
}: {
  set: WorkoutSet
  kind: ExerciseKind
  oneRepMaxKg: number | null
  targetHeartRateMin: number | null
  targetHeartRateMax: number | null
  targetResistanceLevel: number | null
  targetRpm: number | null
  busy: boolean
  disabled: boolean
  onSave: (value: WorkoutSetInput) => void
}) {
  const [weight, setWeight] = useState(set.weightKg?.toString() ?? '')
  const [reps, setReps] = useState(set.reps?.toString() ?? '')
  const [rpe, setRpe] = useState(set.rpe?.toString() ?? '')
  const [rir, setRir] = useState(set.rir?.toString() ?? '')
  const [actualTempo, setActualTempo] = useState(set.actualTempo ?? '')
  const [duration, setDuration] = useState(
    set.durationSeconds?.toString() ?? '',
  )
  const [heartRate, setHeartRate] = useState(set.heartRateBpm?.toString() ?? '')
  const [resistance, setResistance] = useState(
    set.resistanceLevel?.toString() ?? '',
  )
  const [rpm, setRpm] = useState(set.rpm?.toString() ?? '')
  const value = (completed: boolean) => ({
    weightKg: kind === 'cardio' || weight === '' ? null : Number(weight),
    reps: kind === 'cardio' || reps === '' ? null : Number(reps),
    rpe: kind === 'cardio' || rpe === '' ? null : Number(rpe),
    rir: kind === 'cardio' || rir === '' ? null : Number(rir),
    actualTempo: kind === 'cardio' ? null : actualTempo.trim() || null,
    durationSeconds:
      kind === 'cardio' && duration !== '' ? Number(duration) : null,
    heartRateBpm:
      kind === 'cardio' && heartRate !== '' ? Number(heartRate) : null,
    resistanceLevel:
      kind === 'cardio' && resistance !== '' ? Number(resistance) : null,
    rpm: kind === 'cardio' && rpm !== '' ? Number(rpm) : null,
    completed,
  })

  if (kind === 'cardio')
    return (
      <div
        className={`set-row grid grid-cols-[28px_1fr_1fr] items-end gap-2 rounded-xl p-3 sm:grid-cols-[36px_repeat(4,minmax(72px,1fr))_auto] ${set.completed ? 'set-complete' : 'bg-paper'}`}
      >
        <div className="pb-2 text-center text-sm font-black text-muted">
          {set.order + 1}
        </div>
        <label className="text-xs font-semibold text-muted">
          Duration (sec)
          {set.targetDurationSeconds != null && (
            <span className="block font-normal">
              Target {durationLabel(set.targetDurationSeconds)}
            </span>
          )}
          <input
            className="field mt-1 !bg-surface !py-2"
            type="number"
            min="0"
            max="14400"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Heart rate (bpm)
          {targetHeartRateMin != null && targetHeartRateMax != null && (
            <span className="block font-normal">
              Target {targetHeartRateMin}–{targetHeartRateMax}
            </span>
          )}
          <input
            className="field mt-1 !bg-surface !py-2"
            type="number"
            min="30"
            max="240"
            value={heartRate}
            onChange={(e) => setHeartRate(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Resistance
          {targetResistanceLevel != null && (
            <span className="block font-normal">
              Target {targetResistanceLevel}
            </span>
          )}
          <input
            className="field mt-1 !bg-surface !py-2"
            type="number"
            min="0"
            max="9999.99"
            step="0.1"
            value={resistance}
            onChange={(e) => setResistance(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          RPM
          {targetRpm != null && (
            <span className="block font-normal">Target {targetRpm}</span>
          )}
          <input
            className="field mt-1 !bg-surface !py-2"
            type="number"
            min="0"
            max="300"
            step="0.1"
            value={rpm}
            onChange={(e) => setRpm(e.target.value)}
            disabled={disabled}
          />
        </label>
        <div className="col-span-3 flex flex-wrap justify-end gap-2 sm:col-span-1">
          <button
            type="button"
            className="button-quiet !px-3 !py-2"
            disabled={busy || disabled}
            onClick={() => onSave(value(set.completed))}
          >
            Save
          </button>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-sm font-bold ${set.completed ? 'bg-accent/15 text-accent' : 'bg-accent text-deep'}`}
            disabled={busy || disabled}
            onClick={() => onSave(value(!set.completed))}
          >
            {set.completed ? '✓ Done' : 'Complete'}
          </button>
        </div>
      </div>
    )

  return (
    <div
      className={`set-row grid grid-cols-[28px_1fr_1fr] items-end gap-2 rounded-xl p-3 sm:grid-cols-[36px_repeat(5,minmax(62px,1fr))_auto] ${set.completed ? 'set-complete' : 'bg-paper'}`}
    >
      <div className="pb-2 text-center text-sm font-black text-muted">
        {set.order + 1}
      </div>
      <label className="text-xs font-semibold text-muted">
        {kind === 'bodyweight' ? 'Added load (kg)' : 'Weight (kg)'}
        <input
          className="field mt-1 !bg-surface !py-2"
          type="number"
          min="0"
          max="9999.99"
          step="0.25"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          disabled={disabled}
          placeholder={kind === 'bodyweight' ? 'Optional' : undefined}
        />
      </label>
      <label className="text-xs font-semibold text-muted">
        Reps <span className="font-normal">/ {set.targetReps}</span>
        <input
          className="field mt-1 !bg-surface !py-2"
          type="number"
          min="0"
          max="1000"
          step="1"
          inputMode="numeric"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          disabled={disabled}
        />
      </label>
      <label className="col-span-1 text-xs font-semibold text-muted">
        RPE
        <input
          className="field mt-1 !bg-surface !py-2"
          type="number"
          min="1"
          max="10"
          step="0.5"
          inputMode="decimal"
          value={rpe}
          onChange={(e) => setRpe(e.target.value)}
          disabled={disabled}
          placeholder="—"
        />
      </label>
      <label className="col-span-1 text-xs font-semibold text-muted">
        RIR
        <input
          className="field mt-1 !bg-surface !py-2"
          type="number"
          min="0"
          max="10"
          step="0.5"
          inputMode="decimal"
          value={rir}
          onChange={(e) => setRir(e.target.value)}
          disabled={disabled}
          placeholder="—"
        />
      </label>
      <label className="col-span-1 text-xs font-semibold text-muted">
        Actual tempo
        <input
          className="field mt-1 !bg-surface !py-2"
          value={actualTempo}
          onChange={(e) => setActualTempo(e.target.value)}
          disabled={disabled}
          maxLength={20}
          placeholder="3-1-1"
        />
      </label>
      <div className="col-span-3 flex flex-wrap justify-end gap-2 sm:col-span-1">
        <button
          className="button-quiet !px-3 !py-2"
          disabled={busy || disabled}
          onClick={() => onSave(value(set.completed))}
        >
          Save
        </button>
        <button
          className={`rounded-xl px-3 py-2 text-sm font-bold ${set.completed ? 'bg-accent/15 text-accent' : 'bg-accent text-deep'}`}
          disabled={busy || disabled}
          onClick={() => onSave(value(!set.completed))}
        >
          {set.completed ? '✓ Done' : 'Complete'}
        </button>
      </div>
      {(set.estimatedOneRmKg != null || set.percentageOfOneRm != null) && (
        <div className="col-span-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted sm:col-span-7">
          {set.percentageOfOneRm != null && (
            <span>
              {set.percentageOfOneRm}%{' '}
              {oneRepMaxKg ? 'of entered 1RM' : 'of estimated 1RM'}
            </span>
          )}
          {set.estimatedOneRmKg != null && (
            <span>Estimated 1RM: {set.estimatedOneRmKg} kg</span>
          )}
        </div>
      )}
    </div>
  )
}

function RestTimer() {
  const [remaining, setRemaining] = useState(90)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  useEffect(() => {
    if (endsAt === null) return
    const update = () => {
      const next = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setRemaining(next)
      if (next === 0) setEndsAt(null)
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [endsAt])
  return (
    <button
      type="button"
      className={`rest-timer ${endsAt !== null ? 'is-running' : ''} ${remaining === 0 ? 'is-finished' : ''}`}
      aria-label={
        endsAt !== null
          ? `Pause rest timer at ${durationLabel(remaining)}`
          : `Start rest timer at ${durationLabel(remaining === 0 ? 90 : remaining)}`
      }
      onClick={() => {
        if (endsAt !== null) {
          setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
          setEndsAt(null)
        } else {
          const seconds = remaining === 0 ? 90 : remaining
          setRemaining(seconds)
          setEndsAt(Date.now() + seconds * 1000)
        }
      }}
    >
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="11" />
        <circle
          cx="14"
          cy="14"
          r="11"
          pathLength="90"
          strokeDasharray="90"
          strokeDashoffset={90 - remaining}
        />
      </svg>
      <span>
        {endsAt !== null
          ? 'Pause rest'
          : remaining === 0
            ? 'Rest complete'
            : remaining === 90
              ? 'Rest timer'
              : 'Resume rest'}
        <strong>{durationLabel(remaining)}</strong>
      </span>
    </button>
  )
}

function RoutinesPage({
  routines,
  busy,
  hasActive,
  onStart,
  onEdit,
  onDelete,
  onNew,
}: {
  routines: Routine[]
  busy: boolean
  hasActive: boolean
  onStart: (routine: Routine) => void
  onEdit: (routine: Routine) => void
  onDelete: (routine: Routine) => void
  onNew: () => void
}) {
  if (!routines.length)
    return (
      <EmptyState
        title="Build your first routine"
        body="Add exercises, set counts and rep targets. You can change them any time."
        action="Create a routine"
        onAction={onNew}
      />
    )
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {routines.map((routine) => (
        <div className="card routine-card flex flex-col p-6" key={routine.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow mb-2">
                <Icon name="routine" size={15} /> TRAINING ROUTINE
              </p>
              <h2 className="text-2xl font-black tracking-tight">
                {routine.name}
              </h2>
            </div>
            <span className="rounded-lg bg-paper px-3 py-1 text-xs font-bold text-muted">
              {routine.exercises.length} exercises
            </span>
          </div>
          <div className="my-6 flex-1 divide-y divide-line">
            {routine.exercises.map((exercise) => (
              <div
                key={exercise.id}
                className="flex justify-between gap-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{exercise.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {exercise.options.map((option) => option.name).join(' · ')}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold capitalize text-muted">
                    {exercise.section === 'warmup'
                      ? 'Warm-up'
                      : exercise.section === 'cooldown'
                        ? 'Cool-down'
                        : 'Working sets'}
                    {exercise.groupType ? ` · ${exercise.groupType}` : ''}
                    {exercise.targetTempo
                      ? ` · Tempo ${exercise.targetTempo}`
                      : ''}
                    {exercise.targetHeartRateMin != null &&
                    exercise.targetHeartRateMax != null
                      ? ` · HR ${exercise.targetHeartRateMin}–${exercise.targetHeartRateMax}`
                      : ''}
                    {exercise.targetResistanceLevel != null
                      ? ` · Resistance ${exercise.targetResistanceLevel}`
                      : ''}
                    {exercise.targetRpm != null
                      ? ` · ${exercise.targetRpm} RPM`
                      : ''}
                    {exercise.targetDurationSeconds != null
                      ? ` · ${durationLabel(exercise.targetDurationSeconds)}`
                      : ''}
                  </p>
                </div>
                <span className="whitespace-nowrap text-muted">
                  {exercise.sets} × {exercise.targetReps}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="button-primary"
              disabled={busy || hasActive}
              title={
                hasActive ? 'Finish your current workout first' : undefined
              }
              onClick={() => onStart(routine)}
            >
              Start workout
            </button>
            <button className="button-quiet" onClick={() => onEdit(routine)}>
              Edit
            </button>
            <button
              className="px-3 text-sm font-semibold text-muted hover:text-red-300"
              disabled={busy}
              onClick={() => onDelete(routine)}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ProgressPage({
  stats,
  entries,
  exercises,
  history,
  onSave,
  onDelete,
}: {
  stats: Stats
  entries: BodyweightEntry[]
  exercises: ExerciseDefinition[]
  history: WorkoutSession[]
  onSave: (
    id: string | null,
    value: { weightKg: number; measuredOn: string },
  ) => Promise<void>
  onDelete: (entry: BodyweightEntry) => void
}) {
  const [editing, setEditing] = useState<BodyweightEntry | null>(null)
  const [weight, setWeight] = useState('')
  const [measuredOn, setMeasuredOn] = useState(localDateInput())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const ascending = [...entries].sort(
    (a, b) =>
      a.measuredOn.localeCompare(b.measuredOn) ||
      a.createdAt.localeCompare(b.createdAt),
  )
  const values = ascending.map((entry) => entry.weightKg)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const padding = Math.max((max - min) * 0.15, 1)
  const low = min - padding
  const high = max + padding
  const points = ascending.map((entry, index) => ({
    entry,
    x:
      ascending.length === 1
        ? 400
        : 32 + (index / (ascending.length - 1)) * 736,
    y: 180 - ((entry.weightKg - low) / (high - low)) * 145,
  }))
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await onSave(editing?.id ?? null, {
        weightKg: Number(weight),
        measuredOn,
      })
      setEditing(null)
      setWeight('')
      setMeasuredOn(localDateInput())
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : 'Could not save this measurement.',
      )
    } finally {
      setSaving(false)
    }
  }

  function startEdit(entry: BodyweightEntry) {
    setEditing(entry)
    setWeight(String(entry.weightKg))
    setMeasuredOn(entry.measuredOn)
    setFormError('')
  }

  function cancelEdit() {
    setEditing(null)
    setWeight('')
    setMeasuredOn(localDateInput())
    setFormError('')
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card metric-card">
          <p className="eyebrow">Completed workouts</p>
          <p className="metric-value">
            <CountUp value={stats.workouts} />
          </p>
          <p className="metric-caption">All time</p>
        </div>
        <div className="card metric-card">
          <p className="eyebrow">Work sets</p>
          <p className="metric-value">
            <CountUp value={stats.weeklySets} />
          </p>
          <p className="metric-caption">This week</p>
        </div>
        <div className="card metric-card">
          <p className="eyebrow">Best session tonnage</p>
          <p className="metric-value">
            {stats.sessionTonnageRecordKg == null
              ? '—'
              : stats.sessionTonnageRecordKg.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}
          </p>
          <p className="metric-caption">kg · complete load data</p>
        </div>
      </div>
      <section className="card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Bodyweight</p>
            <h2 className="mt-2 text-2xl font-black">Your trend over time</h2>
            <p className="mt-2 text-sm text-muted">
              {entries.length
                ? `${entries.length} saved ${entries.length === 1 ? 'measurement' : 'measurements'}`
                : 'Add an occasional reading to start your trend.'}
            </p>
          </div>
          {entries.length > 0 && (
            <div className="rounded-xl bg-paper px-4 py-3">
              <p className="text-xs font-semibold text-muted">Latest</p>
              <p className="mt-1 text-2xl font-black">
                {entries[0].weightKg} <span className="text-sm">kg</span>
              </p>
            </div>
          )}
        </div>
        {points.length ? (
          <div className="mt-6 overflow-hidden rounded-xl bg-paper p-2 sm:p-4">
            <svg
              viewBox="0 0 800 220"
              className="progress-svg h-52 w-full"
              role="img"
              aria-label={`Bodyweight trend with ${ascending.length} measurements`}
            >
              {[35, 107, 180].map((y) => (
                <line
                  key={y}
                  x1="24"
                  x2="776"
                  y1={y}
                  y2={y}
                  stroke="#303537"
                  strokeDasharray="4 6"
                />
              ))}
              {points.length > 1 && (
                <path
                  className="chart-line"
                  pathLength="1"
                  d={path}
                  fill="none"
                  stroke="#c4f563"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {points.map((point) => (
                <circle
                  key={point.entry.id}
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill="#c4f563"
                  stroke="#191d1f"
                  strokeWidth="2"
                >
                  <title>{`${point.entry.weightKg} kg on ${point.entry.measuredOn}`}</title>
                </circle>
              ))}
            </svg>
            <div className="flex justify-between px-2 text-xs text-muted">
              <span>{dateLabel(`${ascending[0].measuredOn}T12:00:00`)}</span>
              <span>
                {dateLabel(
                  `${ascending[ascending.length - 1].measuredOn}T12:00:00`,
                )}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-paper px-5 py-10 text-center text-sm text-muted">
            Your trend line will appear after you save a measurement.
          </div>
        )}
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.8fr)]">
        <section className="card p-5 md:p-6">
          <p className="eyebrow">
            {editing ? 'Update measurement' : 'Log a measurement'}
          </p>
          <form
            onSubmit={submit}
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <label className="text-xs font-semibold text-muted">
              Weight (kg)
              <input
                className="field mt-1"
                type="number"
                min="1"
                max="500"
                step="0.1"
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                required
                placeholder="e.g. 78.4"
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              Date
              <input
                className="field mt-1"
                type="date"
                max={localDateInput()}
                value={measuredOn}
                onChange={(event) => setMeasuredOn(event.target.value)}
                required
              />
            </label>
            <button className="button-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update entry' : 'Save entry'}
            </button>
          </form>
          {formError && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {formError}
            </p>
          )}
          {editing && (
            <button className="button-quiet mt-3" onClick={cancelEdit}>
              Cancel edit
            </button>
          )}
        </section>
        <section className="card p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Measurements</p>
              <h2 className="mt-2 text-lg font-black">Recent entries</h2>
            </div>
            <span className="text-xs text-muted">kg</span>
          </div>
          {entries.length ? (
            <div className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
              {[...entries]
                .sort(
                  (a, b) =>
                    b.measuredOn.localeCompare(a.measuredOn) ||
                    b.createdAt.localeCompare(a.createdAt),
                )
                .map((entry) => (
                  <div
                    className="flex items-center justify-between gap-3 py-3"
                    key={entry.id}
                  >
                    <div>
                      <p className="font-bold">{entry.weightKg} kg</p>
                      <p className="mt-1 text-xs text-muted">
                        {dateLabel(`${entry.measuredOn}T12:00:00`)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="button-quiet !px-3 !py-2"
                        onClick={() => startEdit(entry)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-sm font-semibold text-muted hover:text-red-300"
                        onClick={() => onDelete(entry)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              No measurements saved yet.
            </p>
          )}
        </section>
      </div>
      <div className="card p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Personal records</p>
            <h2 className="mt-2 text-xl font-black">Best sets by exercise</h2>
          </div>
          <span className="text-xs text-muted">
            updated from completed workouts
          </span>
        </div>
        {stats.personalRecords.length ? (
          <div className="mt-4 divide-y divide-line">
            {stats.personalRecords.map((record) => (
              <div
                className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_2fr] sm:items-center"
                key={record.exerciseId ?? record.exercise}
              >
                <p className="font-bold">{record.exercise}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {record.heaviestSetKg != null && (
                    <span className="rounded-lg bg-paper px-2.5 py-1.5">
                      Heaviest {record.heaviestSetKg} kg
                    </span>
                  )}
                  {record.mostReps != null && (
                    <span className="rounded-lg bg-paper px-2.5 py-1.5">
                      Most reps {record.mostReps} at {record.mostRepsAtKg} kg
                    </span>
                  )}
                  {record.estimatedOneRmKg != null && (
                    <span className="rounded-lg bg-paper px-2.5 py-1.5">
                      Estimated 1RM {record.estimatedOneRmKg} kg
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted">
            Your records will appear after you finish a workout with logged
            sets.
          </p>
        )}
      </div>
      <ExerciseProgressPanel exercises={exercises} />
      <SessionComparisonPanel history={history} />
    </div>
  )
}

function ExerciseProgressPanel({
  exercises,
}: {
  exercises: ExerciseDefinition[]
}) {
  type Metric = 'load' | 'reps' | 'estimated' | 'volume'
  const [selected, setSelected] = useState(exercises[0]?.id ?? '')
  const [progress, setProgress] = useState<ExerciseProgress | null>(null)
  const [metric, setMetric] = useState<Metric>('load')
  const [pending, setPending] = useState(exercises.length > 0)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    request<ExerciseProgress>(`/api/exercises/${selected}/progress`)
      .then((value) => {
        if (!cancelled) {
          setProgress(value)
          setError('')
        }
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load exercise history.',
          )
      })
      .finally(() => {
        if (!cancelled) setPending(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const metrics: { id: Metric; label: string; unit: string }[] = [
    { id: 'load', label: 'Best load', unit: 'kg' },
    { id: 'reps', label: 'Total reps', unit: 'reps' },
    { id: 'estimated', label: 'Estimated 1RM', unit: 'kg' },
    { id: 'volume', label: 'Volume', unit: 'kg' },
  ]
  const activeMetric = metrics.find((item) => item.id === metric)!
  const values = (progress?.points ?? [])
    .map((point, index) => ({
      point,
      index,
      value:
        metric === 'load'
          ? point.bestLoadKg
          : metric === 'reps'
            ? point.totalReps
            : metric === 'estimated'
              ? point.estimatedOneRmKg
              : point.volumeKg,
    }))
    .filter(
      (item): item is typeof item & { value: number } => item.value != null,
    )
  const rawValues = values.map((item) => item.value)
  const minimum = rawValues.length ? Math.min(...rawValues) : 0
  const maximum = rawValues.length ? Math.max(...rawValues) : 0
  const padding = Math.max(
    (maximum - minimum) * 0.16,
    metric === 'reps' ? 1 : 1,
  )
  const low = Math.max(0, minimum - padding)
  const high = maximum + padding
  const chartPoints = values.map((item) => ({
    ...item,
    x:
      (progress?.points.length ?? 0) < 2
        ? 400
        : 32 + (item.index / ((progress?.points.length ?? 2) - 1)) * 736,
    y: 180 - ((item.value - low) / (high - low)) * 145,
  }))
  const path = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  return (
    <section className="card p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Exercise progress</p>
          <h2 className="mt-2 text-xl font-black">
            Training trend by movement
          </h2>
        </div>
        <label className="w-full max-w-sm text-xs font-semibold text-muted">
          Exercise
          <select
            className="field mt-1"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value)
              setPending(true)
              setError('')
            }}
            disabled={!exercises.length}
          >
            {!exercises.length && <option value="">No exercises yet</option>}
            {[...exercises]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((exercise) => (
                <option value={exercise.id} key={exercise.id}>
                  {exercise.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div
        className="mt-5 flex flex-wrap gap-2"
        role="group"
        aria-label="Progress chart measure"
      >
        {metrics.map((item) => (
          <button
            key={item.id}
            className={
              metric === item.id ? 'button-primary !py-2' : 'button-quiet !py-2'
            }
            onClick={() => setMetric(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {pending ? (
        <div className="mt-5 rounded-xl bg-paper p-10 text-center text-sm text-muted">
          Loading exercise history…
        </div>
      ) : error ? (
        <p
          className="mt-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : chartPoints.length ? (
        <div className="mt-5 overflow-hidden rounded-xl bg-paper p-2 sm:p-4">
          <p className="px-2 text-sm font-semibold">
            {activeMetric.label} · {activeMetric.unit}
          </p>
          <svg
            viewBox="0 0 800 220"
            className="progress-svg mt-2 h-56 w-full"
            role="img"
            aria-label={`${activeMetric.label} progress over ${chartPoints.length} workouts`}
          >
            {[35, 107, 180].map((y) => (
              <line
                key={y}
                x1="24"
                x2="776"
                y1={y}
                y2={y}
                stroke="#303537"
                strokeDasharray="4 6"
              />
            ))}
            {chartPoints.length > 1 && (
              <path
                className="chart-line"
                pathLength="1"
                d={path}
                fill="none"
                stroke="#c4f563"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {chartPoints.map((point) => (
              <circle
                key={`${point.point.date}:${point.index}`}
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#c4f563"
                stroke="#191d1f"
                strokeWidth="2"
              >
                <title>{`${point.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${activeMetric.unit} on ${dateLabel(point.point.date)}`}</title>
              </circle>
            ))}
          </svg>
          <div className="flex justify-between px-2 text-xs text-muted">
            <span>{dateLabel(chartPoints[0].point.date)}</span>
            <span>
              {dateLabel(chartPoints[chartPoints.length - 1].point.date)}
            </span>
          </div>
          <p className="mt-2 px-2 text-xs text-muted">
            {chartPoints.length} completed workout
            {chartPoints.length === 1 ? '' : 's'} with this measure.
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-xl bg-paper px-5 py-10 text-center text-sm text-muted">
          No {activeMetric.label.toLowerCase()} data for this exercise yet.
        </div>
      )}
    </section>
  )
}

function SessionComparisonPanel({ history }: { history: WorkoutSession[] }) {
  const comparable = history.filter((session) => session.routineId != null)
  let initialLeft = comparable[0]?.id ?? ''
  let initialRight = ''
  for (let i = 0; i < comparable.length && !initialRight; i++) {
    const match = comparable
      .slice(i + 1)
      .find((session) => session.routineId === comparable[i].routineId)
    if (match) {
      initialLeft = comparable[i].id
      initialRight = match.id
    }
  }
  const [leftId, setLeftId] = useState(initialLeft)
  const [rightId, setRightId] = useState(initialRight)
  const left = comparable.find((session) => session.id === leftId)
  const rightChoices = comparable.filter(
    (session) => session.routineId === left?.routineId && session.id !== leftId,
  )
  const right = rightChoices.find((session) => session.id === rightId)

  function summary(exercise: WorkoutSession['exercises'][number] | undefined) {
    if (!exercise) return null
    const sets = exercise.sets.filter((set) => set.completed)
    const loads = sets
      .map((set) =>
        exercise.kind === 'cardio'
          ? null
          : exercise.kind === 'bodyweight'
            ? set.bodyMassKg == null
              ? null
              : set.bodyMassKg + (set.weightKg ?? 0)
            : set.weightKg,
      )
      .filter((load): load is number => load != null)
    const completeVolume =
      sets.length > 0 &&
      exercise.kind !== 'cardio' &&
      sets.every(
        (set) =>
          set.reps != null &&
          (exercise.kind === 'bodyweight'
            ? set.bodyMassKg != null
            : set.weightKg != null),
      )
    const volumeKg = completeVolume
      ? sets.reduce(
          (sum, set) =>
            sum +
            (exercise.kind === 'bodyweight'
              ? (set.bodyMassKg ?? 0) + (set.weightKg ?? 0)
              : (set.weightKg ?? 0)) *
              (set.reps ?? 0),
          0,
        )
      : null
    const estimates = sets
      .map((set) => set.estimatedOneRmKg)
      .filter((value): value is number => value != null)
    return {
      setCount: sets.length,
      totalReps: sets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
      bestLoadKg: loads.length ? Math.max(...loads) : null,
      estimatedOneRmKg: estimates.length ? Math.max(...estimates) : null,
      volumeKg,
      durationSeconds: sets.reduce(
        (sum, set) => sum + (set.durationSeconds ?? 0),
        0,
      ),
    }
  }

  const comparisonRows =
    left && right
      ? left.exercises.map((exercise, index) => {
          const match =
            right.exercises.find(
              (other) =>
                exercise.routineSlotId &&
                exercise.routineSlotId === other.routineSlotId,
            ) ?? right.exercises.find((other) => other.order === exercise.order)
          return {
            key:
              exercise.routineSlotId ??
              `${exercise.order}:${exercise.slotName}`,
            left: exercise,
            right: match,
            index,
          }
        })
      : []

  function display(value: number | null | undefined, unit: string) {
    return value == null
      ? '—'
      : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`
  }
  function change(a: number | null, b: number | null, unit: string) {
    if (a == null || b == null) return '—'
    const delta = b - a
    return delta === 0
      ? 'No change'
      : `${delta > 0 ? '+' : ''}${delta.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`
  }

  return (
    <section className="card p-5 md:p-6">
      <div>
        <p className="eyebrow">Compare sessions</p>
        <h2 className="mt-2 text-xl font-black">
          Repeat the same routine and compare
        </h2>
        <p className="mt-2 text-sm text-muted">
          We line up exercise slots and show the actual movement choice for each
          workout.
        </p>
      </div>
      {comparable.length < 2 ? (
        <p className="mt-5 rounded-xl bg-paper p-4 text-sm text-muted">
          Finish the same routine twice to compare its exercise slots.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted">
              Session A
              <select
                className="field mt-1"
                value={leftId}
                onChange={(event) => {
                  const nextLeftId = event.target.value
                  const nextLeft = comparable.find(
                    (session) => session.id === nextLeftId,
                  )
                  const nextRight = comparable.find(
                    (session) =>
                      session.id !== nextLeftId &&
                      session.routineId === nextLeft?.routineId,
                  )
                  setLeftId(nextLeftId)
                  setRightId(nextRight?.id ?? '')
                }}
              >
                {comparable.map((session) => (
                  <option value={session.id} key={session.id}>
                    {session.name} ·{' '}
                    {dateLabel(session.completedAt ?? session.startedAt)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted">
              Session B
              <select
                className="field mt-1"
                value={rightId}
                onChange={(event) => setRightId(event.target.value)}
                disabled={!rightChoices.length}
              >
                {rightChoices.map((session) => (
                  <option value={session.id} key={session.id}>
                    {session.name} ·{' '}
                    {dateLabel(session.completedAt ?? session.startedAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {left && right ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[left, right].map((session) => (
                  <div className="rounded-xl bg-paper p-4" key={session.id}>
                    <p className="text-xs font-semibold text-muted">
                      {dateLabel(session.completedAt ?? session.startedAt)}
                    </p>
                    <p className="mt-1 font-black">{session.name}</p>
                    <p className="mt-2 text-xs text-muted">
                      {session.metrics.totalReps} reps ·{' '}
                      {session.metrics.tonnageKg == null
                        ? 'tonnage —'
                        : `${session.metrics.tonnageKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg tonnage${session.metrics.tonnageComplete ? '' : ' partial'}`}{' '}
                      · {durationLabel(session.durationSeconds)}
                      {session.rating != null
                        ? ` · Rating ${session.rating}/5`
                        : ''}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-3">
                {comparisonRows.map((row) => {
                  const a = summary(row.left)!
                  const b = summary(row.right)
                  const sameExercise = Boolean(
                    row.right &&
                    row.left.exerciseId &&
                    row.left.exerciseId === row.right.exerciseId,
                  )
                  return (
                    <article
                      className="rounded-xl border border-line p-4"
                      key={row.key}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-black">
                          {String(row.index + 1).padStart(2, '0')} ·{' '}
                          {row.left.slotName}
                        </h3>
                        {row.right && (
                          <span className="text-xs text-muted">
                            {sameExercise
                              ? 'Same movement'
                              : `Different choices: ${row.left.name} · ${row.right.name}`}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                        <p>
                          Session A:{' '}
                          <span className="font-semibold">{row.left.name}</span>
                          <br />
                          <span className="text-xs text-muted">
                            {a.setCount} sets · {a.totalReps} reps · best load{' '}
                            {display(a.bestLoadKg, 'kg')} · e1RM{' '}
                            {display(a.estimatedOneRmKg, 'kg')} · volume{' '}
                            {display(a.volumeKg, 'kg')}
                            {row.left.kind === 'cardio'
                              ? ` · ${durationLabel(a.durationSeconds)}`
                              : ''}
                          </span>
                        </p>
                        <p>
                          {row.right ? (
                            <>
                              Session B:{' '}
                              <span className="font-semibold">
                                {row.right.name}
                              </span>
                              <br />
                              <span className="text-xs text-muted">
                                {b?.setCount} sets · {b?.totalReps} reps · best
                                load {display(b?.bestLoadKg, 'kg')} · e1RM{' '}
                                {display(b?.estimatedOneRmKg, 'kg')} · volume{' '}
                                {display(b?.volumeKg, 'kg')}
                                {row.right.kind === 'cardio'
                                  ? ` · ${durationLabel(b?.durationSeconds ?? 0)}`
                                  : ''}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted">
                              No matching slot in Session B.
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {sameExercise && b
                            ? `Change: best load ${change(a.bestLoadKg, b.bestLoadKg, 'kg')} · reps ${change(a.totalReps, b.totalReps, 'reps')} · e1RM ${change(a.estimatedOneRmKg, b.estimatedOneRmKg, 'kg')} · volume ${change(a.volumeKg, b.volumeKg, 'kg')}`
                            : 'Movement choices differ; each movement is summarized separately.'}
                        </p>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="mt-5 rounded-xl bg-paper p-4 text-sm text-muted">
              Choose two completed sessions from the same routine.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function HistoryPage({ history }: { history: WorkoutSession[] }) {
  function describeSet(
    exercise: WorkoutSession['exercises'][number],
    set: WorkoutSet,
  ) {
    let description: string
    if (exercise.kind === 'bodyweight') {
      const added = set.weightKg ?? 0
      const load =
        set.bodyMassKg == null
          ? added > 0
            ? `+ ${added} kg added (body mass not recorded)`
            : 'Bodyweight (body mass not recorded)'
          : `${set.bodyMassKg} kg body mass${added > 0 ? ` + ${added} kg added` : ''}`
      description = `${load} × ${set.reps}`
    } else if (exercise.kind === 'cardio')
      description = `${durationLabel(set.durationSeconds ?? 0)}${set.heartRateBpm != null ? ` · ${set.heartRateBpm} bpm` : ''}${set.resistanceLevel != null ? ` · resistance ${set.resistanceLevel}` : ''}${set.rpm != null ? ` · ${set.rpm} RPM` : ''}`
    else description = `${set.weightKg} kg × ${set.reps}`
    const details = [
      set.percentageOfOneRm != null ? `${set.percentageOfOneRm}% 1RM` : '',
      set.estimatedOneRmKg != null
        ? `estimated 1RM ${set.estimatedOneRmKg} kg`
        : '',
      set.actualTempo ? `tempo ${set.actualTempo}` : '',
    ].filter(Boolean)
    return `${description}${details.length ? ` (${details.join(' · ')})` : ''}`
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <h2 className="mb-4 text-xl font-black">Recent workouts</h2>
        {history.length ? (
          <div className="space-y-3">
            {history.map((session) => (
              <details className="card history-card group p-5" key={session.id}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted">
                      {dateLabel(session.completedAt!)}
                    </p>
                    <h3 className="mt-1 text-lg font-black">{session.name}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {session.exercises.reduce(
                        (sum, x) =>
                          sum + x.sets.filter((s) => s.completed).length,
                        0,
                      )}{' '}
                      completed sets · {session.metrics.totalReps} reps ·{' '}
                      {session.metrics.tonnageKg == null
                        ? 'tonnage —'
                        : `${session.metrics.tonnageKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg tonnage${!session.metrics.tonnageComplete ? ' (partial)' : ''}`}{' '}
                      · {durationLabel(session.durationSeconds)}
                      {session.rating != null
                        ? ` · Rated ${session.rating}/5`
                        : ''}
                    </p>
                  </div>
                  <span className="text-2xl text-muted group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="mt-5 border-t border-line pt-4">
                  {session.exercises.map((exercise) => (
                    <div key={exercise.id} className="mb-4">
                      <h4 className="text-sm font-bold">{exercise.name}</h4>
                      <p className="mt-1 text-sm text-muted">
                        {exercise.sets
                          .filter((s) => s.completed)
                          .map((s) => describeSet(exercise, s))
                          .join(' · ') || 'No completed sets'}
                      </p>
                    </div>
                  ))}
                  {session.ratingNote && (
                    <p className="rounded-xl bg-paper p-3 text-sm text-muted">
                      Session note: {session.ratingNote}
                    </p>
                  )}
                  {session.notes && (
                    <p className="mt-2 rounded-xl bg-paper p-3 text-sm text-muted">
                      {session.notes}
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No finished workouts yet"
            body="Finish a session to see it here."
          />
        )}
      </div>
      <ActivityCalendar history={history} />
    </div>
  )
}

function ExercisesPage({
  exercises,
  onNew,
  onEdit,
  onDelete,
}: {
  exercises: ExerciseDefinition[]
  onNew: () => void
  onEdit: (exercise: ExerciseDefinition) => void
  onDelete: (exercise: ExerciseDefinition) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ExerciseKind | 'all'>('all')
  const visible = exercises
    .filter(
      (e) =>
        (filter === 'all' || e.kind === filter) &&
        e.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="library-page">
      <div className="library-toolbar">
        <label className="search-field">
          <Icon name="search" size={19} />
          <input
            type="search"
            aria-label="Search exercises"
            placeholder="Find a movement…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>↵</kbd>
        </label>
        <button className="button-accent" onClick={onNew}>
          <Icon name="plus" size={17} /> Add exercise
        </button>
      </div>
      <div className="library-filter-row">
        <div className="filter-tabs" role="group" aria-label="Exercise type">
          {(['all', 'strength', 'bodyweight', 'cardio'] as const).map(
            (kind) => (
              <button
                key={kind}
                aria-pressed={filter === kind}
                onClick={() => setFilter(kind)}
              >
                {kind === 'all'
                  ? 'All movements'
                  : kind.charAt(0).toUpperCase() + kind.slice(1)}
                <span>
                  {
                    exercises.filter((e) => kind === 'all' || e.kind === kind)
                      .length
                  }
                </span>
              </button>
            ),
          )}
        </div>
        <span className="library-count">{visible.length} movements</span>
      </div>
      {visible.length ? (
        <div className="exercise-grid">
          {visible.map((exercise) => (
            <article
              className={`card exercise-tile kind-${exercise.kind}`}
              key={exercise.id}
            >
              <div className="exercise-tile-top">
                <span className="exercise-type-icon">
                  <Icon
                    name={
                      exercise.kind === 'cardio'
                        ? 'bolt'
                        : exercise.kind === 'bodyweight'
                          ? 'target'
                          : 'exercise'
                    }
                    size={25}
                  />
                </span>
                <span className="type-tag">
                  {exercise.kind === 'strength'
                    ? 'STRENGTH'
                    : exercise.kind.toUpperCase()}
                </span>
              </div>
              <h2>{exercise.name}</h2>
              <p>
                {exercise.oneRepMaxKg ? (
                  <>
                    <strong>{exercise.oneRepMaxKg}</strong> kg entered 1RM
                  </>
                ) : exercise.kind === 'cardio' ? (
                  'Find your pace. Build your engine.'
                ) : (
                  'Ready for your next session.'
                )}
              </p>
              <div className="exercise-tile-footer">
                <button className="text-link" onClick={() => onEdit(exercise)}>
                  Edit movement <Icon name="arrow" size={15} />
                </button>
                <button
                  className="remove-exercise"
                  aria-label={`Remove ${exercise.name}`}
                  onClick={() => onDelete(exercise)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            exercises.length
              ? 'No matching movements'
              : 'Your next chapter starts here'
          }
          body={
            exercises.length
              ? 'Try another name or change the exercise type.'
              : 'Build your personal collection of strength, bodyweight and cardio movements.'
          }
          action={
            exercises.length ? 'Clear filters' : 'Add your first exercise'
          }
          onAction={
            exercises.length
              ? () => {
                  setQuery('')
                  setFilter('all')
                }
              : onNew
          }
        />
      )}
    </div>
  )
}

function ExerciseEditor({
  exercise,
  busy,
  error,
  onClose,
  onSave,
}: {
  exercise: ExerciseDefinition | null
  busy: boolean
  error?: string
  onClose: () => void
  onSave: (input: {
    name: string
    kind: ExerciseKind
    oneRepMaxKg: number | null
  }) => void
}) {
  const [name, setName] = useState(exercise?.name ?? '')
  const [kind, setKind] = useState<ExerciseKind>(exercise?.kind ?? 'strength')
  const [oneRepMax, setOneRepMax] = useState(
    exercise?.oneRepMaxKg?.toString() ?? '',
  )
  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({
      name,
      kind,
      oneRepMaxKg: oneRepMax === '' ? null : Number(oneRepMax),
    })
  }
  return (
    <Modal label="Exercise editor" onClose={onClose}>
      <form onSubmit={submit} className="editor-form">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Exercise library</p>
            <h2 className="text-2xl font-black">
              {exercise ? 'Edit exercise' : 'Add an exercise'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-muted hover:text-ink"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        {error && (
          <p role="alert" className="error-banner mt-5">
            {error}
          </p>
        )}
        <label className="mt-7 block text-sm font-bold">
          Exercise name
          <input
            className="field mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
            autoFocus
            placeholder="e.g. Incline chest press"
          />
        </label>
        <label className="mt-5 block text-sm font-bold">
          Exercise type
          <select
            className="field mt-2"
            value={kind}
            onChange={(event) => {
              const nextKind = event.target.value as ExerciseKind
              setKind(nextKind)
              if (nextKind === 'cardio') setOneRepMax('')
            }}
          >
            <option value="strength">Loaded strength</option>
            <option value="bodyweight">Bodyweight</option>
            <option value="cardio">Cardio</option>
          </select>
        </label>
        {kind !== 'cardio' && (
          <label className="mt-5 block text-sm font-bold">
            Entered 1RM (kg){' '}
            <span className="font-normal text-muted">(optional)</span>
            <input
              className="field mt-2"
              type="number"
              min="1"
              max="9999.99"
              step="0.25"
              inputMode="decimal"
              value={oneRepMax}
              onChange={(event) => setOneRepMax(event.target.value)}
              placeholder="Use a recent tested max"
            />
          </label>
        )}
        <p className="mt-3 text-xs leading-5 text-muted">
          Estimated 1RMs use a generalized RPE chart for sets of 1–12 reps at
          RPE 6–10. Treat them as estimates; your chart may differ by lift.
        </p>
        <div className="mt-8 flex justify-end gap-3 border-t border-line pt-5">
          <button type="button" className="button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save exercise'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RoutineEditor({
  routine,
  busy,
  error,
  library,
  onClose,
  onSave,
}: {
  routine: Routine | null
  busy: boolean
  error?: string
  library: ExerciseDefinition[]
  onClose: () => void
  onSave: (input: RoutineInput) => void
}) {
  const [name, setName] = useState(routine?.name ?? '')
  const [exercises, setExercises] = useState<RoutineInput['exercises']>(
    routine?.exercises.map((x) => ({
      id: x.id,
      groupId: x.groupId,
      name: x.name,
      exerciseId: x.exerciseId,
      options: x.options.map((option) => ({
        name: option.name,
        exerciseId: option.exerciseId,
      })),
      sets: x.sets,
      targetReps: x.targetReps,
      section: x.section,
      targetTempo: x.targetTempo ?? '',
      targetHeartRateMin: x.targetHeartRateMin,
      targetHeartRateMax: x.targetHeartRateMax,
      targetResistanceLevel: x.targetResistanceLevel,
      targetRpm: x.targetRpm,
      targetDurationSeconds: x.targetDurationSeconds,
    })) ?? [
      {
        name: '',
        groupId: null,
        exerciseId: null,
        options: [{ name: '', exerciseId: null }],
        sets: 3,
        targetReps: 8,
        section: 'work',
        targetTempo: '',
        targetHeartRateMin: null,
        targetHeartRateMax: null,
        targetResistanceLevel: null,
        targetRpm: null,
        targetDurationSeconds: null,
      },
    ],
  )

  const groups = [
    ...new Set(
      exercises
        .map((exercise) => exercise.groupId)
        .filter((groupId): groupId is string => Boolean(groupId)),
    ),
  ].map((groupId) => ({
    groupId,
    count: exercises.filter((exercise) => exercise.groupId === groupId).length,
  }))

  function assignGroup(index: number, groupId: string | null) {
    setExercises((current) => {
      const oldGroup = current[index].groupId
      const oldCount = oldGroup
        ? current.filter((exercise) => exercise.groupId === oldGroup).length
        : 0
      return current.map((exercise, i) => {
        if (i === index) return { ...exercise, groupId }
        if (
          oldGroup &&
          oldGroup !== groupId &&
          oldCount <= 2 &&
          exercise.groupId === oldGroup
        )
          return { ...exercise, groupId: null }
        return exercise
      })
    })
  }

  function groupWithPrevious(index: number) {
    if (index === 0) return
    const currentGroup = exercises[index].groupId
    const previousGroup = exercises[index - 1].groupId
    const targetGroup = previousGroup ?? currentGroup ?? crypto.randomUUID()
    setExercises((current) =>
      current.map((exercise, i) => {
        const belongsToMerge =
          currentGroup &&
          currentGroup !== targetGroup &&
          exercise.groupId === currentGroup
        return i === index || i === index - 1 || belongsToMerge
          ? { ...exercise, groupId: targetGroup }
          : exercise
      }),
    )
  }

  function removeSlot(index: number) {
    setExercises((current) => {
      const groupId = current[index].groupId
      const members = groupId
        ? current.filter((exercise) => exercise.groupId === groupId).length
        : 0
      return current
        .filter((_, i) => i !== index)
        .map((exercise) =>
          groupId && members <= 2 && exercise.groupId === groupId
            ? { ...exercise, groupId: null }
            : exercise,
        )
    })
  }

  function change(
    index: number,
    field: 'name' | 'sets' | 'targetReps' | 'section' | 'targetTempo',
    value: string,
  ) {
    setExercises((current) =>
      current.map((item, i) => {
        if (i !== index) return item
        if (field === 'name') return { ...item, name: value }
        if (field === 'section')
          return { ...item, section: value as 'work' | 'warmup' | 'cooldown' }
        if (field === 'targetTempo') return { ...item, targetTempo: value }
        return { ...item, [field]: Number(value) }
      }),
    )
  }

  function changeCardioTarget(
    index: number,
    field:
      | 'targetHeartRateMin'
      | 'targetHeartRateMax'
      | 'targetResistanceLevel'
      | 'targetRpm'
      | 'targetDurationSeconds',
    value: string,
  ) {
    const numeric = value === '' ? null : Number(value)
    setExercises((current) =>
      current.map((item, i) =>
        i === index ? { ...item, [field]: numeric } : item,
      ),
    )
  }

  function changeOption(index: number, optionIndex: number, value: string) {
    setExercises((current) =>
      current.map((item, i) => {
        if (i !== index) return item
        const currentOption = item.options[optionIndex]
        const match = library.find(
          (entry) =>
            entry.name.trim().toLocaleLowerCase() ===
            value.trim().toLocaleLowerCase(),
        )
        const options = item.options.map((option, j) =>
          j === optionIndex
            ? { name: value, exerciseId: match?.id ?? null }
            : option,
        )
        const shouldUpdateLabel =
          optionIndex === 0 &&
          (!item.name.trim() || item.name === currentOption.name)
        return { ...item, name: shouldUpdateLabel ? value : item.name, options }
      }),
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({ name, exercises })
  }

  return (
    <Modal label="Routine editor" onClose={onClose} wide>
      <form onSubmit={submit} className="editor-form routine-editor-form">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-2">Training plan</p>
            <h2 className="text-2xl font-black">
              {routine ? 'Edit routine' : 'New routine'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-muted hover:text-ink"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        {error && (
          <p role="alert" className="error-banner mt-5">
            {error}
          </p>
        )}
        <label className="mt-7 block text-sm font-bold">
          Routine name
          <input
            className="field mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            placeholder="e.g. Upper body A"
          />
        </label>
        <div className="mt-7 flex items-center justify-between">
          <h3 className="font-black">Exercise slots</h3>
          <span className="text-xs text-muted">Shared set and rep targets</span>
        </div>
        <div className="mt-3 space-y-3">
          {exercises.map((exercise, index) => (
            <div
              key={index}
              className="rounded-xl border border-line bg-paper p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-muted">
                  Slot {index + 1}
                </span>
                <button
                  type="button"
                  disabled={exercises.length === 1}
                  className="text-xs font-bold text-muted hover:text-red-300"
                  onClick={() => removeSlot(index)}
                >
                  Remove slot
                </button>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <label className="text-xs font-semibold text-muted">
                  Grouping
                  <select
                    className="field mt-1"
                    value={exercise.groupId ?? ''}
                    onChange={(event) =>
                      assignGroup(index, event.target.value || null)
                    }
                  >
                    <option value="">Individual exercise</option>
                    {groups.map((group, groupIndex) => (
                      <option key={group.groupId} value={group.groupId}>
                        {groupIndex + 1}.{' '}
                        {group.count === 2
                          ? 'Superset'
                          : group.count === 3
                            ? 'Tri-set'
                            : 'Giant set'}{' '}
                        ({group.count} slots)
                      </option>
                    ))}
                  </select>
                </label>
                <span className="pb-2 text-xs text-muted">
                  Group size sets the type.
                </span>
                <button
                  type="button"
                  className="button-quiet !px-3 !py-2"
                  disabled={index === 0}
                  onClick={() => groupWithPrevious(index)}
                >
                  Group with previous
                </button>
              </div>
              <label className="block text-xs font-semibold text-muted">
                Movement label
                <input
                  className="field mt-1"
                  value={exercise.name}
                  onChange={(e) => change(index, 'name', e.target.value)}
                  maxLength={100}
                  required
                  placeholder="e.g. Incline chest press"
                />
              </label>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-muted">
                  Exercise choices · use one each workout
                </p>
                {exercise.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-semibold text-muted">
                      Choice {optionIndex + 1}
                      <input
                        className="field mt-1"
                        list="exercise-library-options"
                        value={option.name}
                        onChange={(event) =>
                          changeOption(index, optionIndex, event.target.value)
                        }
                        maxLength={100}
                        required
                        placeholder="e.g. Cable incline press"
                      />
                    </label>
                    <button
                      type="button"
                      className="button-quiet !px-3 !py-2"
                      disabled={exercise.options.length === 1}
                      onClick={() =>
                        setExercises((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  options: item.options.filter(
                                    (_, j) => j !== optionIndex,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }
                      aria-label={`Remove choice ${optionIndex + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="button-quiet mt-2 !px-3 !py-2"
                disabled={exercise.options.length >= 8}
                onClick={() =>
                  setExercises((current) =>
                    current.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            options: [
                              ...item.options,
                              { name: '', exerciseId: null },
                            ],
                          }
                        : item,
                    ),
                  )
                }
              >
                + Add exercise choice
              </button>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-muted">
                  Section
                  <select
                    className="field mt-1"
                    value={exercise.section}
                    onChange={(e) => change(index, 'section', e.target.value)}
                  >
                    <option value="warmup">Warm-up</option>
                    <option value="work">Working sets</option>
                    <option value="cooldown">Cool-down</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-muted">
                  Target tempo (optional)
                  <input
                    className="field mt-1"
                    value={exercise.targetTempo ?? ''}
                    onChange={(e) =>
                      change(index, 'targetTempo', e.target.value)
                    }
                    maxLength={20}
                    placeholder="3-1-1"
                  />
                </label>
                <label className="text-xs font-semibold text-muted">
                  Sets
                  <input
                    className="field mt-1"
                    type="number"
                    min="1"
                    max="10"
                    value={exercise.sets}
                    onChange={(e) => change(index, 'sets', e.target.value)}
                    required
                  />
                </label>
                <label className="text-xs font-semibold text-muted">
                  Reps
                  <input
                    className="field mt-1"
                    type="number"
                    min="1"
                    max="100"
                    value={exercise.targetReps}
                    onChange={(e) =>
                      change(index, 'targetReps', e.target.value)
                    }
                    required
                  />
                </label>
              </div>
              {exercise.options.some((option) =>
                library.some(
                  (definition) =>
                    definition.id === option.exerciseId &&
                    definition.kind === 'cardio',
                ),
              ) && (
                <div className="mt-4 rounded-xl bg-surface p-4">
                  <p className="text-xs font-bold text-muted">
                    Cardio targets · enter manually
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-muted">
                      Target duration (seconds)
                      <input
                        className="field mt-1"
                        type="number"
                        min="1"
                        max="14400"
                        value={exercise.targetDurationSeconds ?? ''}
                        onChange={(e) =>
                          changeCardioTarget(
                            index,
                            'targetDurationSeconds',
                            e.target.value,
                          )
                        }
                        placeholder="e.g. 900"
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted">
                      Target resistance level
                      <input
                        className="field mt-1"
                        type="number"
                        min="0"
                        max="9999.99"
                        step="0.1"
                        value={exercise.targetResistanceLevel ?? ''}
                        onChange={(e) =>
                          changeCardioTarget(
                            index,
                            'targetResistanceLevel',
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted">
                      Target RPM
                      <input
                        className="field mt-1"
                        type="number"
                        min="1"
                        max="300"
                        step="0.1"
                        value={exercise.targetRpm ?? ''}
                        onChange={(e) =>
                          changeCardioTarget(index, 'targetRpm', e.target.value)
                        }
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-muted">
                        Target HR min
                        <input
                          className="field mt-1"
                          type="number"
                          min="30"
                          max="240"
                          value={exercise.targetHeartRateMin ?? ''}
                          onChange={(e) =>
                            changeCardioTarget(
                              index,
                              'targetHeartRateMin',
                              e.target.value,
                            )
                          }
                          placeholder="bpm"
                        />
                      </label>
                      <label className="text-xs font-semibold text-muted">
                        Target HR max
                        <input
                          className="field mt-1"
                          type="number"
                          min="30"
                          max="240"
                          value={exercise.targetHeartRateMax ?? ''}
                          onChange={(e) =>
                            changeCardioTarget(
                              index,
                              'targetHeartRateMax',
                              e.target.value,
                            )
                          }
                          placeholder="bpm"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <datalist id="exercise-library-options">
          {library.map((item) => (
            <option key={item.id} value={item.name}>
              {item.kind}
            </option>
          ))}
        </datalist>
        <button
          type="button"
          className="button-quiet mt-3"
          disabled={exercises.length >= 20}
          onClick={() =>
            setExercises((current) => [
              ...current,
              {
                name: '',
                groupId: null,
                exerciseId: null,
                options: [{ name: '', exerciseId: null }],
                sets: 3,
                targetReps: 8,
                section: 'work',
                targetTempo: '',
                targetHeartRateMin: null,
                targetHeartRateMax: null,
                targetResistanceLevel: null,
                targetRpm: null,
                targetDurationSeconds: null,
              },
            ])
          }
        >
          + Add slot
        </button>
        <div className="mt-8 flex justify-end gap-3 border-t border-line pt-5">
          <button type="button" className="button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save routine'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string
  body: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="card empty-state">
      <div className="empty-state-art">
        <span />
        <span />
        <div>
          <Icon name="exercise" size={32} />
        </div>
      </div>
      <p className="eyebrow">ROOM FOR SOMETHING GREAT</p>
      <h2>{title}</h2>
      <p>{body}</p>
      {action && (
        <button className="button-accent" onClick={onAction}>
          <Icon name="plus" size={16} />
          {action}
          <Icon name="arrow" size={16} />
        </button>
      )}
    </div>
  )
}

export default App
