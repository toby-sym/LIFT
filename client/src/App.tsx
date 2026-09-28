import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, json, request, type Routine, type RoutineInput, type Stats, type WorkoutSession, type WorkoutSet } from './api'

type Page = 'today' | 'routines' | 'history'
type Account = { email: string }

const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date(value))

function App() {
  const [account, setAccount] = useState<Account | null>(null)
  const [checking, setChecking] = useState(true)
  const [startupError, setStartupError] = useState(false)
  const [page, setPage] = useState<Page>('today')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [active, setActive] = useState<WorkoutSession | null>(null)
  const [history, setHistory] = useState<WorkoutSession[]>([])
  const [stats, setStats] = useState<Stats>({ workouts: 0, weeklySets: 0, bests: [] })
  const [editing, setEditing] = useState<Routine | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function loadData() {
    const [nextRoutines, nextActive, nextHistory, nextStats] = await Promise.all([
      request<Routine[]>('/api/routines'),
      request<WorkoutSession | null>('/api/sessions/active'),
      request<WorkoutSession[]>('/api/sessions/history'),
      request<Stats>('/api/stats'),
    ])
    setRoutines(nextRoutines)
    setActive(nextActive)
    setHistory(nextHistory)
    setStats(nextStats)
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
          <button onClick={() => setPage('today')} className="flex items-center gap-2 text-2xl font-black tracking-[-.08em]" aria-label="LIFT home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-base text-accent">L</span>LIFT<span className="text-accent">.</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-52 truncate text-sm text-muted sm:block">{account.email}</span>
            <button className="text-sm font-semibold text-muted hover:text-ink" onClick={signOut} disabled={busy}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20 pt-7 md:px-8 md:pt-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow mb-2">Your training space</p>
            <h1 className="text-4xl font-black tracking-[-.055em] md:text-5xl">{page === 'today' ? 'Make today count.' : page === 'routines' ? 'Your routines.' : 'Your progress.'}</h1>
          </div>
          <button className="button-accent" onClick={() => setEditing('new')}>+ New routine</button>
        </div>

        <nav className="mb-7 flex gap-1 overflow-x-auto border-b border-line" aria-label="Main navigation">
          {([['today', 'Today'], ['routines', 'Routines'], ['history', 'History']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setPage(id)} className={`whitespace-nowrap border-b-2 px-5 py-3 text-sm font-semibold transition ${page === id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}{id === 'today' && active ? <span className="ml-2 inline-block h-2 w-2 rounded-full bg-[#83b729]" /> : null}
            </button>
          ))}
        </nav>

        {error && <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        {page === 'today' && <TodayPage active={active} routines={routines} stats={stats} busy={busy}
          onStart={startWorkout} onNew={() => setEditing('new')} onSaveSet={saveSet} onSaveNotes={saveNotes}
          onFinish={finishWorkout} onDiscard={discardWorkout} />}
        {page === 'routines' && <RoutinesPage routines={routines} busy={busy} hasActive={Boolean(active)} onStart={startWorkout}
          onEdit={setEditing} onDelete={deleteRoutine} onNew={() => setEditing('new')} />}
        {page === 'history' && <HistoryPage history={history} stats={stats} />}
      </main>

      {editing && <RoutineEditor routine={editing === 'new' ? null : editing} busy={busy}
        onClose={() => setEditing(null)} onSave={saveRoutine} />}
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

function TodayPage({ active, routines, stats, busy, onStart, onNew, onSaveSet, onSaveNotes, onFinish, onDiscard }: {
  active: WorkoutSession | null; routines: Routine[]; stats: Stats; busy: boolean
  onStart: (routine: Routine) => void; onNew: () => void
  onSaveSet: (sessionId: string, setId: string, value: { weightKg: number | null; reps: number | null; completed: boolean }) => void
  onSaveNotes: (sessionId: string, notes: string) => void
  onFinish: (id: string, notes: string) => void; onDiscard: (id: string) => void
}) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div>
      {active ? <WorkoutPanel key={active.id} session={active} busy={busy} onSaveSet={onSaveSet} onSaveNotes={onSaveNotes} onFinish={onFinish} onDiscard={onDiscard} /> : <>
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

function WorkoutPanel({ session, busy, onSaveSet, onSaveNotes, onFinish, onDiscard }: {
  session: WorkoutSession; busy: boolean
  onSaveSet: (sessionId: string, setId: string, value: { weightKg: number | null; reps: number | null; completed: boolean }) => void
  onSaveNotes: (sessionId: string, notes: string) => void
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
      <div className="mb-5 flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-paper text-xs font-black">{String(index + 1).padStart(2, '0')}</span><h3 className="text-lg font-black">{exercise.name}</h3></div>
      <div className="space-y-2">{exercise.sets.map(set => <SetRow key={`${set.id}:${set.weightKg}:${set.reps}:${set.completed}`} set={set} busy={busy} onSave={value => onSaveSet(session.id, set.id, value)} />)}</div>
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

function SetRow({ set, busy, onSave }: { set: WorkoutSet; busy: boolean; onSave: (value: { weightKg: number | null; reps: number | null; completed: boolean }) => void }) {
  const [weight, setWeight] = useState(set.weightKg?.toString() ?? '')
  const [reps, setReps] = useState(set.reps?.toString() ?? '')
  const value = (completed: boolean) => ({
    weightKg: weight === '' ? null : Number(weight),
    reps: reps === '' ? null : Number(reps),
    completed,
  })

  return <div className={`grid grid-cols-[32px_1fr_1fr] items-end gap-2 rounded-xl p-3 sm:grid-cols-[42px_1fr_1fr_auto] ${set.completed ? 'bg-[#f2f9e7]' : 'bg-paper'}`}>
    <div className="pb-2 text-center text-sm font-black text-muted">{set.order + 1}</div>
    <label className="text-xs font-semibold text-muted">Weight (kg)<input className="field mt-1 !bg-white !py-2" type="number" min="0" max="9999.99" step="0.25" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} /></label>
    <label className="text-xs font-semibold text-muted">Reps <span className="font-normal">/ {set.targetReps}</span><input className="field mt-1 !bg-white !py-2" type="number" min="0" max="1000" step="1" inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} /></label>
    <div className="col-span-3 flex justify-end gap-2 sm:col-span-1">
      <button className="button-quiet !px-3 !py-2" disabled={busy} onClick={() => onSave(value(set.completed))}>Save</button>
      <button className={`rounded-xl px-3 py-2 text-sm font-bold ${set.completed ? 'bg-ink text-white' : 'bg-accent text-ink'}`} disabled={busy} onClick={() => onSave(value(!set.completed))}>{set.completed ? '✓ Done' : 'Complete'}</button>
    </div>
  </div>
}

function RoutinesPage({ routines, busy, hasActive, onStart, onEdit, onDelete, onNew }: {
  routines: Routine[]; busy: boolean; hasActive: boolean; onStart: (routine: Routine) => void; onEdit: (routine: Routine) => void; onDelete: (routine: Routine) => void; onNew: () => void
}) {
  if (!routines.length) return <EmptyState title="Build your first routine" body="Add exercises, set counts and rep targets. You can change them any time." action="Create a routine" onAction={onNew} />
  return <div className="grid gap-5 md:grid-cols-2">{routines.map(routine => <div className="card flex flex-col p-6" key={routine.id}>
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow mb-2">Routine</p><h2 className="text-2xl font-black tracking-tight">{routine.name}</h2></div><span className="rounded-lg bg-paper px-3 py-1 text-xs font-bold text-muted">{routine.exercises.length} exercises</span></div>
    <div className="my-6 flex-1 divide-y divide-line">{routine.exercises.map(exercise => <div key={exercise.id} className="flex justify-between gap-4 py-3 text-sm"><span className="font-semibold">{exercise.name}</span><span className="whitespace-nowrap text-muted">{exercise.sets} × {exercise.targetReps}</span></div>)}</div>
    <div className="flex flex-wrap gap-2"><button className="button-primary" disabled={busy || hasActive} title={hasActive ? 'Finish your current workout first' : undefined} onClick={() => onStart(routine)}>Start workout</button><button className="button-quiet" onClick={() => onEdit(routine)}>Edit</button><button className="px-3 text-sm font-semibold text-muted hover:text-red-700" disabled={busy} onClick={() => onDelete(routine)}>Delete</button></div>
  </div>)}</div>
}

function HistoryPage({ history, stats }: { history: WorkoutSession[]; stats: Stats }) {
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div><h2 className="mb-4 text-xl font-black">Recent workouts</h2>
      {history.length ? <div className="space-y-3">{history.map(session => <details className="card group p-5" key={session.id}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><p className="text-xs font-semibold text-muted">{dateLabel(session.completedAt!)}</p><h3 className="mt-1 text-lg font-black">{session.name}</h3><p className="mt-1 text-sm text-muted">{session.exercises.reduce((sum, x) => sum + x.sets.filter(s => s.completed).length, 0)} completed sets</p></div><span className="text-2xl text-muted group-open:rotate-45">+</span></summary>
        <div className="mt-5 border-t border-line pt-4">{session.exercises.map(exercise => <div key={exercise.id} className="mb-4"><h4 className="text-sm font-bold">{exercise.name}</h4><p className="mt-1 text-sm text-muted">{exercise.sets.filter(s => s.completed).map(s => `${s.weightKg} kg × ${s.reps}`).join(' · ') || 'No completed sets'}</p></div>)}
          {session.notes && <p className="rounded-xl bg-paper p-3 text-sm text-muted">{session.notes}</p>}</div>
      </details>)}</div> : <EmptyState title="No finished workouts yet" body="Finish a session to see it here." />}
    </div>
    <aside className="space-y-4"><div className="card p-6"><p className="eyebrow">Completed workouts</p><p className="mt-3 text-5xl font-black">{stats.workouts}</p></div>
      <div className="card p-6"><p className="eyebrow">Exercise bests</p>{stats.bests.length ? <div className="mt-4 divide-y divide-line">{stats.bests.map(best => <div className="flex justify-between gap-3 py-3 text-sm" key={best.exercise}><span className="font-semibold">{best.exercise}</span><span className="whitespace-nowrap font-black">{best.weightKg} kg</span></div>)}</div> : <p className="mt-4 text-sm text-muted">Your best lifts will appear as you log sets.</p>}</div>
    </aside>
  </div>
}

function RoutineEditor({ routine, busy, onClose, onSave }: { routine: Routine | null; busy: boolean; onClose: () => void; onSave: (input: RoutineInput) => void }) {
  const [name, setName] = useState(routine?.name ?? '')
  const [exercises, setExercises] = useState<RoutineInput['exercises']>(routine?.exercises.map(x => ({ name: x.name, sets: x.sets, targetReps: x.targetReps })) ?? [{ name: '', sets: 3, targetReps: 8 }])

  function change(index: number, field: 'name' | 'sets' | 'targetReps', value: string) {
    setExercises(current => current.map((item, i) => i === index ? { ...item, [field]: field === 'name' ? value : Number(value) } : item))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave({ name, exercises })
  }

  return <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 py-8 md:items-center" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl md:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow mb-2">Training plan</p><h2 className="text-2xl font-black">{routine ? 'Edit routine' : 'New routine'}</h2></div><button type="button" onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Close">×</button></div>
      <label className="mt-7 block text-sm font-bold">Routine name<input className="field mt-2" value={name} onChange={e => setName(e.target.value)} maxLength={100} required placeholder="e.g. Upper body A" /></label>
      <div className="mt-7 flex items-center justify-between"><h3 className="font-black">Exercises</h3><span className="text-xs text-muted">Sets and rep targets</span></div>
      <div className="mt-3 space-y-3">{exercises.map((exercise, index) => <div key={index} className="rounded-xl border border-line bg-paper p-4">
        <div className="mb-3 flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wider text-muted">Exercise {index + 1}</span><button type="button" disabled={exercises.length === 1} className="text-xs font-bold text-muted hover:text-red-700" onClick={() => setExercises(current => current.filter((_, i) => i !== index))}>Remove</button></div>
        <div className="grid gap-3 sm:grid-cols-[1fr_90px_90px]"><label className="text-xs font-semibold text-muted">Name<input className="field mt-1" value={exercise.name} onChange={e => change(index, 'name', e.target.value)} maxLength={100} required placeholder="e.g. Bench press" /></label>
          <label className="text-xs font-semibold text-muted">Sets<input className="field mt-1" type="number" min="1" max="10" value={exercise.sets} onChange={e => change(index, 'sets', e.target.value)} required /></label>
          <label className="text-xs font-semibold text-muted">Reps<input className="field mt-1" type="number" min="1" max="100" value={exercise.targetReps} onChange={e => change(index, 'targetReps', e.target.value)} required /></label></div>
      </div>)}</div>
      <button type="button" className="button-quiet mt-3" disabled={exercises.length >= 20} onClick={() => setExercises(current => [...current, { name: '', sets: 3, targetReps: 8 }])}>+ Add exercise</button>
      <div className="mt-8 flex justify-end gap-3 border-t border-line pt-5"><button type="button" className="button-quiet" onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save routine'}</button></div>
    </form>
  </div>
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="card px-6 py-12 text-center"><div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-paper text-2xl font-black">+</div><h2 className="text-xl font-black">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>{action && <button className="button-primary mt-6" onClick={onAction}>{action}</button>}</div>
}

export default App
