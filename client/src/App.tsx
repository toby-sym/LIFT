import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, json, request, type BodyweightEntry, type ExerciseDefinition, type ExerciseKind, type Routine, type RoutineInput, type Stats, type WorkoutSession, type WorkoutSet } from './api'

type Page = 'today' | 'routines' | 'exercises' | 'progress' | 'history'
type Account = { email: string }

const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date(value))

const localDateInput = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function App() {
  const [account, setAccount] = useState<Account | null>(null)
  const [checking, setChecking] = useState(true)
  const [startupError, setStartupError] = useState(false)
  const [page, setPage] = useState<Page>('today')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [active, setActive] = useState<WorkoutSession | null>(null)
  const [history, setHistory] = useState<WorkoutSession[]>([])
  const [stats, setStats] = useState<Stats>({ workouts: 0, weeklySets: 0, bests: [] })
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseDefinition[]>([])
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightEntry[]>([])
  const [editing, setEditing] = useState<Routine | 'new' | null>(null)
  const [editingExercise, setEditingExercise] = useState<ExerciseDefinition | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadData() {
    const [nextRoutines, nextActive, nextHistory, nextStats, nextExercises, nextBodyweight] = await Promise.all([
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
      .then(async (me) => { setAccount(me); await loadData() })
      .catch((cause) => {
        if (!(cause instanceof ApiError && cause.status === 401)) setStartupError(true)
        setAccount(null)
      })
      .finally(() => setChecking(false))
  }, [])

  async function run(action: () => Promise<void>) {
    setError('')
    setBusy(true)
    try { await action() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong.') }
    finally { setBusy(false) }
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
      await request<Routine>(current && current !== 'new' ? `/api/routines/${current.id}` : '/api/routines', {
        method: current && current !== 'new' ? 'PUT' : 'POST', body: json(input),
      })
      await loadData()
      setEditing(null)
      setPage('routines')
    })
  }

  async function saveExercise(input: { name: string; kind: ExerciseKind }) {
    await run(async () => {
      const current = editingExercise
      await request<ExerciseDefinition>(current && current !== 'new' ? `/api/exercises/${current.id}` : '/api/exercises', {
        method: current && current !== 'new' ? 'PUT' : 'POST', body: json(input),
      })
      await loadData()
      setEditingExercise(null)
    })
  }

  async function deleteExercise(exercise: ExerciseDefinition) {
    if (!window.confirm(`Remove “${exercise.name}” from your exercise library? Routine and history names will be kept.`)) return
    await run(async () => {
      await request<null>(`/api/exercises/${exercise.id}`, { method: 'DELETE' })
      await loadData()
    })
  }

  async function saveBodyweight(id: string | null, value: { weightKg: number; measuredOn: string }) {
    await request<BodyweightEntry>(id ? `/api/bodyweight/${id}` : '/api/bodyweight', {
      method: id ? 'PUT' : 'POST', body: json(value),
    })
    await loadData()
  }

  async function deleteBodyweight(entry: BodyweightEntry) {
    if (!window.confirm(`Delete the ${entry.weightKg} kg entry from ${entry.measuredOn}?`)) return
    await run(async () => {
      await request<null>(`/api/bodyweight/${entry.id}`, { method: 'DELETE' })
      await loadData()
    })
  }

  async function deleteRoutine(routine: Routine) {
    if (!window.confirm(`Delete “${routine.name}”? Your workout history will stay saved.`)) return
    await run(async () => {
      await request<null>(`/api/routines/${routine.id}`, { method: 'DELETE' })
      await loadData()
    })
  }

  async function startWorkout(routine: Routine) {
    await run(async () => {
      await request<WorkoutSession>('/api/sessions', { method: 'POST', body: json({ routineId: routine.id }) })
      await loadData()
      setPage('today')
    })
  }

  async function chooseExercise(sessionId: string, workoutExerciseId: string, exerciseId: string) {
    const exercise = active?.exercises.find(item => item.id === workoutExerciseId)
    if (exercise?.exerciseId && exercise.exerciseId !== exerciseId &&
        !window.confirm('Changing this choice clears saved sets and discards unsaved entries for this slot. Continue?')) return
    const clearLoggedSets = Boolean(exercise?.sets.some(set => set.completed || set.weightKg !== null || set.reps !== null))
    await run(async () => {
      setActive(await request<WorkoutSession>(`/api/sessions/${sessionId}/exercises/${workoutExerciseId}/choice`, {
        method: 'PUT', body: json({ exerciseId, clearLoggedSets }),
      }))
    })
  }

  async function saveSet(sessionId: string, setId: string, value: { weightKg: number | null; reps: number | null; completed: boolean }) {
    await run(async () => {
      setActive(await request<WorkoutSession>(`/api/sessions/${sessionId}/sets/${setId}`, {
        method: 'PUT', body: json(value),
      }))
    })
  }

  async function saveNotes(sessionId: string, notes: string) {
    await run(async () => {
      await request<null>(`/api/sessions/${sessionId}/notes`, { method: 'PUT', body: json({ notes }) })
      await loadData()
    })
  }

  async function finishWorkout(sessionId: string, notes: string) {
    await run(async () => {
      if (notes !== active?.notes) {
        await request<null>(`/api/sessions/${sessionId}/notes`, { method: 'PUT', body: json({ notes }) })
      }
      await request<WorkoutSession>(`/api/sessions/${sessionId}/finish`, { method: 'POST' })
      await loadData()
      setPage('history')
    })
  }

  async function discardWorkout(sessionId: string) {
    if (!window.confirm('Discard this workout and its logged sets?')) return
    await run(async () => {
      await request<null>(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      await loadData()
    })
  }

  if (checking) return <div className="flex min-h-screen items-center justify-center text-muted">Loading LIFT…</div>
  if (startupError) return <div className="flex min-h-screen items-center justify-center p-6"><div className="card max-w-md p-8 text-center"><h1 className="text-2xl font-black">Could not connect to LIFT</h1><p className="mt-3 text-sm text-muted">Check that the API and database are running, then try again.</p><button className="button-primary mt-6" onClick={() => window.location.reload()}>Try again</button></div></div>
  if (!account) return <AuthScreen onSignedIn={signedIn} />

  const navItems = [['today', 'Today'], ['routines', 'Routines'], ['exercises', 'Exercises'], ['progress', 'Progress'], ['history', 'History']] as const
  const pageTitle = page === 'today' ? 'Train with intention.' : page === 'routines' ? 'Your routines.' : page === 'exercises' ? 'Your exercise library.' : page === 'progress' ? 'See your progress.' : 'Training history.'

  return (
    <div className="app-shell">
      <aside className="app-rail">
        <button onClick={() => setPage('today')} className="brand-lockup" aria-label="LIFT home">
          <span className="brand-mark">L</span><span>LIFT<span className="brand-period">.</span></span>
        </button>
        <p className="rail-label">TRAINING</p>
        <nav className="rail-nav" aria-label="Main navigation">
          {navItems.map(([id, label]) => <button key={id} onClick={() => setPage(id)} className={`rail-link ${page === id ? 'is-active' : ''}`} aria-current={page === id ? 'page' : undefined}>
            <span className={`nav-indicator ${id === 'today' && active ? 'has-workout' : ''}`} />{label}
          </button>)}
        </nav>
        <div className="rail-account">
          <span className="account-avatar" aria-hidden="true">{account.email.slice(0, 1).toUpperCase()}</span>
          <span className="account-email">{account.email}</span>
          <button className="sign-out" onClick={signOut} disabled={busy}>Sign out</button>
        </div>
      </aside>

      <div className="app-main">
        <header className="mobile-topbar">
          <button onClick={() => setPage('today')} className="brand-lockup" aria-label="LIFT home">
            <span className="brand-mark">L</span><span>LIFT<span className="brand-period">.</span></span>
          </button>
          <span className="mobile-avatar" title={account.email}>{account.email.slice(0, 1).toUpperCase()}</span>
        </header>

        <main className="page-wrap">
          <div className="page-heading">
            <div>
              <p className="eyebrow mb-2">YOUR TRAINING SPACE</p>
              <h1 className="page-title">{pageTitle}</h1>
            </div>
            <button className="button-accent" onClick={() => setEditing('new')}>+ New routine</button>
          </div>

        {error && <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        {page === 'today' && <TodayPage active={active} routines={routines} stats={stats} busy={busy}
          onStart={startWorkout} onNew={() => setEditing('new')} onSaveSet={saveSet} onSaveNotes={saveNotes}
          onChooseExercise={chooseExercise} onFinish={finishWorkout} onDiscard={discardWorkout} />}
        {page === 'routines' && <RoutinesPage routines={routines} busy={busy} hasActive={Boolean(active)} onStart={startWorkout}
          onEdit={setEditing} onDelete={deleteRoutine} onNew={() => setEditing('new')} />}
        {page === 'exercises' && <ExercisesPage exercises={exerciseLibrary} onNew={() => setEditingExercise('new')}
          onEdit={setEditingExercise} onDelete={deleteExercise} />}
        {page === 'progress' && <ProgressPage stats={stats} entries={bodyweightEntries} onSave={saveBodyweight} onDelete={deleteBodyweight} />}
        {page === 'history' && <HistoryPage history={history} />}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Main navigation">
        {navItems.map(([id, label]) => <button key={id} onClick={() => setPage(id)} className={`mobile-nav-link ${page === id ? 'is-active' : ''}`} aria-current={page === id ? 'page' : undefined}>
          <span className={`mobile-nav-dot ${id === 'today' && active ? 'has-workout' : ''}`} />{label}
        </button>)}
      </nav>

      {editing && <RoutineEditor routine={editing === 'new' ? null : editing} busy={busy}
        library={exerciseLibrary} onClose={() => setEditing(null)} onSave={saveRoutine} />}
      {editingExercise && <ExerciseEditor exercise={editingExercise === 'new' ? null : editingExercise} busy={busy}
        onClose={() => setEditingExercise(null)} onSave={saveExercise} />}
    </div>
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
      if (mode === 'register') await request<unknown>('/register', { method: 'POST', body: json({ email, password }) })
      await request<unknown>('/login?useCookies=true', { method: 'POST', body: json({ email, password }) })
      await onSignedIn()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
    } finally { setBusy(false) }
  }

  return <div className="grid min-h-screen lg:grid-cols-2">
    <div className="flex flex-col justify-between bg-ink p-8 text-white md:p-14">
      <div className="text-3xl font-black tracking-[-.08em]">LIFT<span className="text-accent">.</span></div>
      <div className="max-w-xl py-16">
        <p className="mb-5 text-sm font-bold uppercase tracking-[.2em] text-accent">Train with intention</p>
        <h1 className="text-5xl font-black leading-[1.04] tracking-[-.06em] md:text-7xl">A stronger routine starts here.</h1>
        <p className="mt-7 max-w-md text-lg leading-relaxed text-white/65">Plan your sessions, log every set, and see the work add up over time.</p>
      </div>
      <p className="text-sm text-white/40">Your training, in one place.</p>
    </div>
    <div className="flex items-center justify-center p-6 md:p-12">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-line bg-white p-7 shadow-sm md:p-10">
        <p className="eyebrow mb-3">Welcome to LIFT</p>
        <h2 className="text-3xl font-black tracking-tight">{mode === 'login' ? 'Sign in' : 'Create an account'}</h2>
        <p className="mt-2 text-sm text-muted">{mode === 'login' ? 'Pick up where you left off.' : 'Start building your training history.'}</p>
        {error && <div role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <label className="mt-7 block text-sm font-semibold">Email address
          <input className="field mt-2" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <label className="mt-5 block text-sm font-semibold">Password
          <input className="field mt-2" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
        </label>
        {mode === 'register' && <p className="mt-2 text-xs text-muted">Use 8+ characters with uppercase, lowercase, number and symbol.</p>}
        <button className="button-primary mt-7 w-full" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="mt-6 text-center text-sm text-muted">{mode === 'login' ? 'New to LIFT?' : 'Already have an account?'}{' '}
          <button type="button" className="font-bold text-ink underline underline-offset-4" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </form>
    </div>
  </div>
}

function TodayPage({ active, routines, stats, busy, onStart, onNew, onSaveSet, onSaveNotes, onChooseExercise, onFinish, onDiscard }: {
  active: WorkoutSession | null; routines: Routine[]; stats: Stats; busy: boolean
  onStart: (routine: Routine) => void; onNew: () => void
  onSaveSet: (sessionId: string, setId: string, value: { weightKg: number | null; reps: number | null; completed: boolean }) => void
  onSaveNotes: (sessionId: string, notes: string) => void
  onChooseExercise: (sessionId: string, workoutExerciseId: string, exerciseId: string) => void
  onFinish: (id: string, notes: string) => void; onDiscard: (id: string) => void
}) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div>
      {active ? <WorkoutPanel key={active.id} session={active} busy={busy} onSaveSet={onSaveSet} onSaveNotes={onSaveNotes} onChooseExercise={onChooseExercise} onFinish={onFinish} onDiscard={onDiscard} /> : <>
        <div className="mb-5 rounded-2xl bg-ink p-7 text-white md:p-9">
          <p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-accent">Ready when you are</p>
          <h2 className="max-w-lg text-3xl font-black tracking-tight">Choose a routine and get to work.</h2>
          <p className="mt-3 text-sm text-white/60">Every completed set is saved to your history.</p>
        </div>
        <h3 className="mb-3 text-lg font-bold">Start a workout</h3>
        {routines.length ? <div className="grid gap-3">
          {routines.map(routine => <div className="card flex flex-wrap items-center justify-between gap-4 p-5" key={routine.id}>
            <div><h4 className="font-bold">{routine.name}</h4><p className="mt-1 text-sm text-muted">{routine.exercises.length} exercises · {routine.exercises.reduce((sum, x) => sum + x.sets, 0)} sets</p></div>
            <button className="button-primary" disabled={busy} onClick={() => onStart(routine)}>Start workout →</button>
          </div>)}
        </div> : <EmptyState title="No routines yet" body="Create your first routine to start logging workouts." action="Create a routine" onAction={onNew} />}
      </>}
    </div>
    <aside className="space-y-4">
      <div className="card p-6"><p className="eyebrow">This week</p><p className="mt-3 text-5xl font-black tracking-tight">{stats.weeklySets}</p><p className="mt-1 text-sm text-muted">completed sets</p></div>
      <div className="card p-6"><p className="eyebrow">All time</p><p className="mt-3 text-5xl font-black tracking-tight">{stats.workouts}</p><p className="mt-1 text-sm text-muted">finished workouts</p></div>
      <div className="rounded-2xl bg-accent p-6"><p className="text-xs font-bold uppercase tracking-[.16em]">Keep showing up</p><p className="mt-3 text-xl font-black leading-tight">Consistency is built one session at a time.</p></div>
    </aside>
  </div>
}

function WorkoutPanel({ session, busy, onSaveSet, onSaveNotes, onChooseExercise, onFinish, onDiscard }: {
  session: WorkoutSession; busy: boolean
  onSaveSet: (sessionId: string, setId: string, value: { weightKg: number | null; reps: number | null; completed: boolean }) => void
  onSaveNotes: (sessionId: string, notes: string) => void
  onChooseExercise: (sessionId: string, workoutExerciseId: string, exerciseId: string) => void
  onFinish: (id: string, notes: string) => void; onDiscard: (id: string) => void
}) {
  const [notes, setNotes] = useState(session.notes)
  const completed = session.exercises.flatMap(x => x.sets).filter(x => x.completed).length
  const total = session.exercises.reduce((sum, x) => sum + x.sets.length, 0)

  return <div className="space-y-5">
    <div className="rounded-2xl bg-ink p-6 text-white md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-accent">Workout in progress</p><h2 className="text-3xl font-black tracking-tight">{session.name}</h2><p className="mt-2 text-sm text-white/60">Started {dateLabel(session.startedAt)}</p></div>
        <div className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold">{completed} / {total} sets</div>
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total ? completed / total * 100 : 0}%` }} /></div>
    </div>
    {session.exercises.map((exercise, index) => <div className="card p-5 md:p-6" key={exercise.id}>
      <div className="mb-5 flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-paper text-xs font-black">{String(index + 1).padStart(2, '0')}</span><div><h3 className="text-lg font-black">{exercise.slotName}</h3>{exercise.exerciseId && exercise.name !== exercise.slotName && <p className="mt-1 text-xs font-semibold text-muted">Using {exercise.name}</p>}</div></div>
      {exercise.options.length > 1 && <label className="mb-4 block max-w-md text-xs font-semibold text-muted">Choose your exercise for this workout<select className="field mt-1" value={exercise.exerciseId ?? ''} onChange={event => { if (event.target.value) onChooseExercise(session.id, exercise.id, event.target.value) }} disabled={busy}>
        <option value="" disabled>Select an option</option>{exercise.options.map(option => <option key={option.id} value={option.exerciseId ?? ''}>{option.name}</option>)}
      </select></label>}
      {!exercise.exerciseId && <p className="mb-3 rounded-lg bg-[#fff8e7] px-3 py-2 text-sm text-[#74510d]">Choose an exercise option to unlock set logging.</p>}
      <div className="space-y-2">{exercise.sets.map(set => <SetRow key={`${exercise.exerciseId}:${set.id}:${set.weightKg}:${set.reps}:${set.completed}`} set={set} busy={busy} disabled={!exercise.exerciseId} onSave={value => onSaveSet(session.id, set.id, value)} />)}</div>
    </div>)}
    <div className="card p-5 md:p-6"><label className="block text-sm font-bold" htmlFor="workout-notes">Workout notes</label>
      <textarea id="workout-notes" className="field mt-3 min-h-28 resize-y" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it feel?" />
      <button className="button-quiet mt-3" disabled={busy || notes === session.notes} onClick={() => onSaveNotes(session.id, notes)}>Save notes</button>
    </div>
    <div className="flex flex-wrap items-center gap-3"><button className="button-accent" disabled={busy || completed === 0} onClick={() => onFinish(session.id, notes)}>Finish workout</button>
      <button className="px-3 py-2 text-sm font-semibold text-muted hover:text-red-700" disabled={busy} onClick={() => onDiscard(session.id)}>Discard workout</button>
    </div>
  </div>
}

function SetRow({ set, busy, disabled, onSave }: { set: WorkoutSet; busy: boolean; disabled: boolean; onSave: (value: { weightKg: number | null; reps: number | null; completed: boolean }) => void }) {
  const [weight, setWeight] = useState(set.weightKg?.toString() ?? '')
  const [reps, setReps] = useState(set.reps?.toString() ?? '')
  const value = (completed: boolean) => ({
    weightKg: weight === '' ? null : Number(weight),
    reps: reps === '' ? null : Number(reps),
    completed,
  })

  return <div className={`grid grid-cols-[32px_1fr_1fr] items-end gap-2 rounded-xl p-3 sm:grid-cols-[42px_1fr_1fr_auto] ${set.completed ? 'bg-[#f2f9e7]' : 'bg-paper'}`}>
    <div className="pb-2 text-center text-sm font-black text-muted">{set.order + 1}</div>
    <label className="text-xs font-semibold text-muted">Weight (kg)<input className="field mt-1 !bg-white !py-2" type="number" min="0" max="9999.99" step="0.25" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} disabled={disabled} /></label>
    <label className="text-xs font-semibold text-muted">Reps <span className="font-normal">/ {set.targetReps}</span><input className="field mt-1 !bg-white !py-2" type="number" min="0" max="1000" step="1" inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} disabled={disabled} /></label>
    <div className="col-span-3 flex justify-end gap-2 sm:col-span-1">
      <button className="button-quiet !px-3 !py-2" disabled={busy || disabled} onClick={() => onSave(value(set.completed))}>Save</button>
      <button className={`rounded-xl px-3 py-2 text-sm font-bold ${set.completed ? 'bg-ink text-white' : 'bg-accent text-ink'}`} disabled={busy || disabled} onClick={() => onSave(value(!set.completed))}>{set.completed ? '✓ Done' : 'Complete'}</button>
    </div>
  </div>
}

function RoutinesPage({ routines, busy, hasActive, onStart, onEdit, onDelete, onNew }: {
  routines: Routine[]; busy: boolean; hasActive: boolean; onStart: (routine: Routine) => void; onEdit: (routine: Routine) => void; onDelete: (routine: Routine) => void; onNew: () => void
}) {
  if (!routines.length) return <EmptyState title="Build your first routine" body="Add exercises, set counts and rep targets. You can change them any time." action="Create a routine" onAction={onNew} />
  return <div className="grid gap-5 md:grid-cols-2">{routines.map(routine => <div className="card flex flex-col p-6" key={routine.id}>
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow mb-2">Routine</p><h2 className="text-2xl font-black tracking-tight">{routine.name}</h2></div><span className="rounded-lg bg-paper px-3 py-1 text-xs font-bold text-muted">{routine.exercises.length} exercises</span></div>
    <div className="my-6 flex-1 divide-y divide-line">{routine.exercises.map(exercise => <div key={exercise.id} className="flex justify-between gap-4 py-3 text-sm"><div><p className="font-semibold">{exercise.name}</p><p className="mt-1 text-xs text-muted">{exercise.options.map(option => option.name).join(' · ')}</p></div><span className="whitespace-nowrap text-muted">{exercise.sets} × {exercise.targetReps}</span></div>)}</div>
    <div className="flex flex-wrap gap-2"><button className="button-primary" disabled={busy || hasActive} title={hasActive ? 'Finish your current workout first' : undefined} onClick={() => onStart(routine)}>Start workout</button><button className="button-quiet" onClick={() => onEdit(routine)}>Edit</button><button className="px-3 text-sm font-semibold text-muted hover:text-red-700" disabled={busy} onClick={() => onDelete(routine)}>Delete</button></div>
  </div>)}</div>
}

function ProgressPage({ stats, entries, onSave, onDelete }: {
  stats: Stats; entries: BodyweightEntry[]
  onSave: (id: string | null, value: { weightKg: number; measuredOn: string }) => Promise<void>
  onDelete: (entry: BodyweightEntry) => void
}) {
  const [editing, setEditing] = useState<BodyweightEntry | null>(null)
  const [weight, setWeight] = useState('')
  const [measuredOn, setMeasuredOn] = useState(localDateInput())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const ascending = [...entries].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn) || a.createdAt.localeCompare(b.createdAt))
  const values = ascending.map(entry => entry.weightKg)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const padding = Math.max((max - min) * 0.15, 1)
  const low = min - padding
  const high = max + padding
  const points = ascending.map((entry, index) => ({
    entry,
    x: ascending.length === 1 ? 400 : 32 + index / (ascending.length - 1) * 736,
    y: 180 - (entry.weightKg - low) / (high - low) * 145,
  }))
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await onSave(editing?.id ?? null, { weightKg: Number(weight), measuredOn })
      setEditing(null)
      setWeight('')
      setMeasuredOn(localDateInput())
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save this measurement.')
    } finally { setSaving(false) }
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

  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="card metric-card"><p className="eyebrow">Completed workouts</p><p className="metric-value">{stats.workouts}</p><p className="metric-caption">All time</p></div>
      <div className="card metric-card"><p className="eyebrow">Work sets</p><p className="metric-value">{stats.weeklySets}</p><p className="metric-caption">This week</p></div>
    </div>
    <section className="card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Bodyweight</p><h2 className="mt-2 text-2xl font-black">Your trend over time</h2><p className="mt-2 text-sm text-muted">{entries.length ? `${entries.length} saved ${entries.length === 1 ? 'measurement' : 'measurements'}` : 'Add an occasional reading to start your trend.'}</p></div>{entries.length > 0 && <div className="rounded-xl bg-paper px-4 py-3"><p className="text-xs font-semibold text-muted">Latest</p><p className="mt-1 text-2xl font-black">{entries[0].weightKg} <span className="text-sm">kg</span></p></div>}</div>
      {points.length ? <div className="mt-6 overflow-hidden rounded-xl bg-[#f7f9f5] p-2 sm:p-4">
        <svg viewBox="0 0 800 220" className="h-52 w-full" role="img" aria-label={`Bodyweight trend with ${ascending.length} measurements`}>
          {[35, 107, 180].map(y => <line key={y} x1="24" x2="776" y1={y} y2={y} stroke="#e1e7dc" strokeDasharray="4 6" />)}
          {points.length > 1 && <path d={path} fill="none" stroke="#8fbd42" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
          {points.map(point => <circle key={point.entry.id} cx={point.x} cy={point.y} r="5" fill="#172328" stroke="white" strokeWidth="2"><title>{`${point.entry.weightKg} kg on ${point.entry.measuredOn}`}</title></circle>)}
        </svg>
        <div className="flex justify-between px-2 text-xs text-muted"><span>{dateLabel(`${ascending[0].measuredOn}T12:00:00`)}</span><span>{dateLabel(`${ascending[ascending.length - 1].measuredOn}T12:00:00`)}</span></div>
      </div> : <div className="mt-5 rounded-xl bg-paper px-5 py-10 text-center text-sm text-muted">Your trend line will appear after you save a measurement.</div>}
    </section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.8fr)]">
      <section className="card p-5 md:p-6">
        <p className="eyebrow">{editing ? 'Update measurement' : 'Log a measurement'}</p>
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-semibold text-muted">Weight (kg)<input className="field mt-1" type="number" min="1" max="500" step="0.1" inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value)} required placeholder="e.g. 78.4" /></label>
          <label className="text-xs font-semibold text-muted">Date<input className="field mt-1" type="date" max={localDateInput()} value={measuredOn} onChange={event => setMeasuredOn(event.target.value)} required /></label>
          <button className="button-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update entry' : 'Save entry'}</button>
        </form>
        {formError && <p role="alert" className="mt-3 text-sm text-red-700">{formError}</p>}
        {editing && <button className="button-quiet mt-3" onClick={cancelEdit}>Cancel edit</button>}
      </section>
      <section className="card p-5 md:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Measurements</p><h2 className="mt-2 text-lg font-black">Recent entries</h2></div><span className="text-xs text-muted">kg</span></div>
        {entries.length ? <div className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">{[...entries].sort((a, b) => b.measuredOn.localeCompare(a.measuredOn) || b.createdAt.localeCompare(a.createdAt)).map(entry => <div className="flex items-center justify-between gap-3 py-3" key={entry.id}>
          <div><p className="font-bold">{entry.weightKg} kg</p><p className="mt-1 text-xs text-muted">{dateLabel(`${entry.measuredOn}T12:00:00`)}</p></div>
          <div className="flex gap-2"><button className="button-quiet !px-3 !py-2" onClick={() => startEdit(entry)}>Edit</button><button className="text-sm font-semibold text-muted hover:text-red-700" onClick={() => onDelete(entry)}>Delete</button></div>
        </div>)}</div> : <p className="mt-4 text-sm text-muted">No measurements saved yet.</p>}
      </section>
    </div>
    <div className="card p-5 md:p-6"><p className="eyebrow">Heaviest recorded sets</p>{stats.bests.length ? <div className="mt-4 divide-y divide-line">{stats.bests.map(best => <div className="flex justify-between gap-3 py-3 text-sm" key={best.exerciseId ?? best.exercise}><span className="font-semibold">{best.exercise}</span><span className="whitespace-nowrap font-black">{best.weightKg} kg</span></div>)}</div> : <p className="mt-4 text-sm leading-6 text-muted">Your best lifts will appear as you log completed sets.</p>}</div>
  </div>
}

function HistoryPage({ history }: { history: WorkoutSession[] }) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div><h2 className="mb-4 text-xl font-black">Recent workouts</h2>
      {history.length ? <div className="space-y-3">{history.map(session => <details className="card group p-5" key={session.id}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><p className="text-xs font-semibold text-muted">{dateLabel(session.completedAt!)}</p><h3 className="mt-1 text-lg font-black">{session.name}</h3><p className="mt-1 text-sm text-muted">{session.exercises.reduce((sum, x) => sum + x.sets.filter(s => s.completed).length, 0)} completed sets</p></div><span className="text-2xl text-muted group-open:rotate-45">+</span></summary>
        <div className="mt-5 border-t border-line pt-4">{session.exercises.map(exercise => <div key={exercise.id} className="mb-4"><h4 className="text-sm font-bold">{exercise.name}</h4><p className="mt-1 text-sm text-muted">{exercise.sets.filter(s => s.completed).map(s => `${s.weightKg} kg × ${s.reps}`).join(' · ') || 'No completed sets'}</p></div>)}
          {session.notes && <p className="rounded-xl bg-paper p-3 text-sm text-muted">{session.notes}</p>}</div>
      </details>)}</div> : <EmptyState title="No finished workouts yet" body="Finish a session to see it here." />}
    </div>
  </div>
}

function ExercisesPage({ exercises, onNew, onEdit, onDelete }: {
  exercises: ExerciseDefinition[]; onNew: () => void; onEdit: (exercise: ExerciseDefinition) => void; onDelete: (exercise: ExerciseDefinition) => void
}) {
  if (!exercises.length) return <EmptyState title="Build your exercise library" body="Save movements here so routines can reuse them and your training history can follow each one." action="Add an exercise" onAction={onNew} />
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">{exercises.length} saved {exercises.length === 1 ? 'exercise' : 'exercises'}</p><button className="button-primary" onClick={onNew}>+ Add exercise</button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{exercises.map(exercise => <article className="card flex items-center justify-between gap-3 p-5" key={exercise.id}>
      <div className="min-w-0"><h2 className="truncate font-bold">{exercise.name}</h2><p className="mt-1 text-xs font-semibold capitalize text-muted">{exercise.kind === 'strength' ? 'Loaded strength' : exercise.kind}</p></div>
      <div className="flex shrink-0 gap-2"><button className="button-quiet !px-3 !py-2" onClick={() => onEdit(exercise)}>Edit</button><button className="text-sm font-semibold text-muted hover:text-red-700" aria-label={`Remove ${exercise.name}`} onClick={() => onDelete(exercise)}>Remove</button></div>
    </article>)}</div>
  </div>
}

function ExerciseEditor({ exercise, busy, onClose, onSave }: {
  exercise: ExerciseDefinition | null; busy: boolean; onClose: () => void; onSave: (input: { name: string; kind: ExerciseKind }) => void
}) {
  const [name, setName] = useState(exercise?.name ?? '')
  const [kind, setKind] = useState<ExerciseKind>(exercise?.kind ?? 'strength')
  function submit(event: FormEvent) { event.preventDefault(); onSave({ name, kind }) }
  return <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 py-8 md:items-center" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl md:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow mb-2">Exercise library</p><h2 className="text-2xl font-black">{exercise ? 'Edit exercise' : 'Add an exercise'}</h2></div><button type="button" onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Close">×</button></div>
      <label className="mt-7 block text-sm font-bold">Exercise name<input className="field mt-2" value={name} onChange={event => setName(event.target.value)} maxLength={100} required autoFocus placeholder="e.g. Incline chest press" /></label>
      <label className="mt-5 block text-sm font-bold">Exercise type<select className="field mt-2" value={kind} onChange={event => setKind(event.target.value as ExerciseKind)}><option value="strength">Loaded strength</option><option value="bodyweight">Bodyweight</option><option value="cardio">Cardio</option></select></label>
      <div className="mt-8 flex justify-end gap-3 border-t border-line pt-5"><button type="button" className="button-quiet" onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save exercise'}</button></div>
    </form>
  </div>
}

function RoutineEditor({ routine, busy, library, onClose, onSave }: { routine: Routine | null; busy: boolean; library: ExerciseDefinition[]; onClose: () => void; onSave: (input: RoutineInput) => void }) {
  const [name, setName] = useState(routine?.name ?? '')
  const [exercises, setExercises] = useState<RoutineInput['exercises']>(routine?.exercises.map(x => ({
    id: x.id, name: x.name, exerciseId: x.exerciseId,
    options: x.options.map(option => ({ name: option.name, exerciseId: option.exerciseId })),
    sets: x.sets, targetReps: x.targetReps,
  })) ?? [{ name: '', exerciseId: null, options: [{ name: '', exerciseId: null }], sets: 3, targetReps: 8 }])

  function change(index: number, field: 'name' | 'sets' | 'targetReps', value: string) {
    setExercises(current => current.map((item, i) => {
      if (i !== index) return item
      if (field === 'name') return { ...item, name: value }
      return { ...item, [field]: Number(value) }
    }))
  }

  function changeOption(index: number, optionIndex: number, value: string) {
    setExercises(current => current.map((item, i) => {
      if (i !== index) return item
      const currentOption = item.options[optionIndex]
      const match = library.find(entry => entry.name.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase())
      const options = item.options.map((option, j) => j === optionIndex ? { name: value, exerciseId: match?.id ?? null } : option)
      const shouldUpdateLabel = optionIndex === 0 && (!item.name.trim() || item.name === currentOption.name)
      return { ...item, name: shouldUpdateLabel ? value : item.name, options }
    }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({ name, exercises })
  }

  return <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 py-8 md:items-center" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl md:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow mb-2">Training plan</p><h2 className="text-2xl font-black">{routine ? 'Edit routine' : 'New routine'}</h2></div><button type="button" onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Close">×</button></div>
      <label className="mt-7 block text-sm font-bold">Routine name<input className="field mt-2" value={name} onChange={e => setName(e.target.value)} maxLength={100} required placeholder="e.g. Upper body A" /></label>
      <div className="mt-7 flex items-center justify-between"><h3 className="font-black">Exercise slots</h3><span className="text-xs text-muted">Shared set and rep targets</span></div>
      <div className="mt-3 space-y-3">{exercises.map((exercise, index) => <div key={index} className="rounded-xl border border-line bg-paper p-4">
        <div className="mb-3 flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wider text-muted">Slot {index + 1}</span><button type="button" disabled={exercises.length === 1} className="text-xs font-bold text-muted hover:text-red-700" onClick={() => setExercises(current => current.filter((_, i) => i !== index))}>Remove slot</button></div>
        <label className="block text-xs font-semibold text-muted">Movement label<input className="field mt-1" value={exercise.name} onChange={e => change(index, 'name', e.target.value)} maxLength={100} required placeholder="e.g. Incline chest press" /></label>
        <div className="mt-4 space-y-2"><p className="text-xs font-semibold text-muted">Exercise choices · use one each workout</p>{exercise.options.map((option, optionIndex) => <div key={optionIndex} className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold text-muted">Choice {optionIndex + 1}<input className="field mt-1" list="exercise-library-options" value={option.name} onChange={event => changeOption(index, optionIndex, event.target.value)} maxLength={100} required placeholder="e.g. Cable incline press" /></label>
          <button type="button" className="button-quiet !px-3 !py-2" disabled={exercise.options.length === 1} onClick={() => setExercises(current => current.map((item, i) => i === index ? { ...item, options: item.options.filter((_, j) => j !== optionIndex) } : item))} aria-label={`Remove choice ${optionIndex + 1}`}>×</button>
        </div>)}</div>
        <button type="button" className="button-quiet mt-2 !px-3 !py-2" disabled={exercise.options.length >= 8} onClick={() => setExercises(current => current.map((item, i) => i === index ? { ...item, options: [...item.options, { name: '', exerciseId: null }] } : item))}>+ Add exercise choice</button>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]"><label className="text-xs font-semibold text-muted">Sets<input className="field mt-1" type="number" min="1" max="10" value={exercise.sets} onChange={e => change(index, 'sets', e.target.value)} required /></label>
          <label className="text-xs font-semibold text-muted">Reps<input className="field mt-1" type="number" min="1" max="100" value={exercise.targetReps} onChange={e => change(index, 'targetReps', e.target.value)} required /></label></div>
      </div>)}</div>
      <datalist id="exercise-library-options">{library.map(item => <option key={item.id} value={item.name}>{item.kind}</option>)}</datalist>
      <button type="button" className="button-quiet mt-3" disabled={exercises.length >= 20} onClick={() => setExercises(current => [...current, { name: '', exerciseId: null, options: [{ name: '', exerciseId: null }], sets: 3, targetReps: 8 }])}>+ Add slot</button>
      <div className="mt-8 flex justify-end gap-3 border-t border-line pt-5"><button type="button" className="button-quiet" onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save routine'}</button></div>
    </form>
  </div>
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="card px-6 py-12 text-center"><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-paper text-2xl font-black">+</div><h2 className="text-xl font-black">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>{action && <button className="button-primary mt-6" onClick={onAction}>{action}</button>}</div>
}

export default App
