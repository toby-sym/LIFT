import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import {
  request,
  type ExerciseDefinition,
  type Routine,
  type Stats,
  type WorkoutSession,
  type WorkoutSet,
} from '../api'
import { TrainingChart } from '../components/Studio'

vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  request: vi.fn(),
}))
const api = vi.mocked(request)
const date = new Date().toISOString()
const exercises: ExerciseDefinition[] = [
  {
    id: 'cable',
    name: 'Cable incline press',
    kind: 'strength',
    oneRepMaxKg: 100,
    createdAt: date,
  },
  {
    id: 'machine',
    name: 'Machine incline press',
    kind: 'strength',
    oneRepMaxKg: null,
    createdAt: date,
  },
  {
    id: 'bike',
    name: 'Stationary bike',
    kind: 'cardio',
    oneRepMaxKg: null,
    createdAt: date,
  },
]
const set: WorkoutSet = {
  id: 'set-1',
  order: 0,
  targetReps: 8,
  weightKg: null,
  bodyMassKg: null,
  reps: null,
  rpe: null,
  rir: null,
  actualTempo: null,
  estimatedOneRmKg: null,
  percentageOfOneRm: null,
  targetDurationSeconds: null,
  durationSeconds: null,
  heartRateBpm: null,
  resistanceLevel: null,
  rpm: null,
  completed: false,
}
const session: WorkoutSession = {
  id: 'session-1',
  routineId: 'routine-1',
  name: 'Upper body A',
  startedAt: date,
  completedAt: null,
  notes: '',
  rating: null,
  ratingNote: '',
  durationSeconds: 0,
  metrics: { totalReps: 0, tonnageKg: null, tonnageComplete: false },
  exercises: [
    {
      id: 'slot-1',
      name: 'Cable incline press',
      slotName: 'Incline press',
      order: 0,
      routineSlotId: 'routine-slot-1',
      exerciseId: 'cable',
      kind: 'strength',
      oneRepMaxKg: 100,
      section: 'work',
      targetTempo: null,
      targetHeartRateMin: null,
      targetHeartRateMax: null,
      targetResistanceLevel: null,
      targetRpm: null,
      groupId: null,
      groupType: null,
      options: exercises
        .slice(0, 2)
        .map((e) => ({
          id: `option-${e.id}`,
          exerciseId: e.id,
          name: e.name,
          kind: e.kind,
          oneRepMaxKg: e.oneRepMaxKg,
        })),
      sets: [set],
    },
  ],
}
const routine: Routine = {
  id: 'routine-1',
  name: 'Upper body A',
  createdAt: date,
  exercises: [
    {
      id: 'routine-slot-1',
      name: 'Incline press',
      exerciseId: 'cable',
      groupId: null,
      groupType: null,
      options: exercises
        .slice(0, 2)
        .map((e) => ({ exerciseId: e.id, name: e.name, kind: e.kind })),
      sets: 3,
      targetReps: 8,
      section: 'work',
      targetTempo: null,
      targetHeartRateMin: null,
      targetHeartRateMax: null,
      targetResistanceLevel: null,
      targetRpm: null,
      targetDurationSeconds: null,
    },
  ],
}
const stats: Stats = {
  workouts: 4,
  weeklySets: 12,
  bests: [],
  personalRecords: [],
  sessionTonnageRecordKg: null,
}
let active: WorkoutSession | null
let savedRoutine: Routine | null
let failExerciseSave: boolean

beforeEach(() => {
  active = null
  savedRoutine = null
  failExerciseSave = false
  api.mockReset()
  api.mockImplementation(async (path, options) => {
    if (path === '/api/me') return { email: 'test@example.test' }
    if (path === '/api/routines' && options?.method === 'POST') {
      savedRoutine = routine
      return routine
    }
    if (path === '/api/routines')
      return savedRoutine ? [savedRoutine] : [routine]
    if (path === '/api/sessions/active') return active
    if (path === '/api/sessions/history') return []
    if (path === '/api/stats') return stats
    if (path === '/api/exercises' && options?.method === 'POST') {
      if (failExerciseSave)
        throw new Error('That exercise name is already in your library.')
      return exercises[0]
    }
    if (path === '/api/exercises') return exercises
    if (path === '/api/bodyweight') return []
    if (path === '/api/sessions' && options?.method === 'POST') {
      active = structuredClone(session)
      return active
    }
    if (path.endsWith('/choice')) {
      const input = JSON.parse(String(options?.body))
      active = {
        ...session,
        exercises: [
          {
            ...session.exercises[0],
            exerciseId: input.exerciseId,
            name: exercises.find((e) => e.id === input.exerciseId)!.name,
          },
        ],
      }
      return active
    }
    if (path.includes('/sets/')) {
      active = {
        ...session,
        exercises: [
          {
            ...session.exercises[0],
            sets: [{ ...set, ...JSON.parse(String(options?.body)) }],
          },
        ],
      }
      return active
    }
    throw new Error(`Unexpected test request: ${path}`)
  })
})

async function openApp() {
  render(<App />)
  await screen.findByRole('heading', { name: 'Training overview' })
}
function navigate(label: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).getByRole('button', { name: label }),
  )
}

describe('Training studio', () => {
  it('shows real account totals and starts the selected routine', async () => {
    await openApp()
    expect(screen.getByLabelText('12').textContent).toBe('12')
    expect(screen.getByLabelText('4').textContent).toBe('4')
    fireEvent.click(screen.getByRole('button', { name: 'Start Upper body A' }))
    await screen.findByText('Workout in progress')
    expect(api).toHaveBeenCalledWith('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ routineId: 'routine-1' }),
    })
    expect(screen.getByLabelText('Weight (kg)')).toBeTruthy()
  })

  it('combines exercise search and type filters and can clear an empty result', async () => {
    await openApp()
    navigate('Exercise library')
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search exercises' }),
      { target: { value: 'incline' } },
    )
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Cardio/ }))
    expect(
      screen.getByRole('heading', { name: 'No matching movements' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('saves multiple movement choices from the new routine dialog', async () => {
    await openApp()
    fireEvent.click(screen.getByRole('button', { name: 'New routine' }))
    const dialog = screen.getByRole('dialog', { name: 'Routine editor' })
    fireEvent.change(within(dialog).getByLabelText('Routine name'), {
      target: { value: 'Chest and back' },
    })
    fireEvent.change(within(dialog).getByLabelText('Movement label'), {
      target: { value: 'Incline chest press' },
    })
    fireEvent.change(within(dialog).getByLabelText('Choice 1'), {
      target: { value: 'Cable incline press' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Add exercise choice/ }),
    )
    fireEvent.change(within(dialog).getByLabelText('Choice 2'), {
      target: { value: 'Machine incline press' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save routine' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const call = api.mock.calls.find(
      ([path, options]) =>
        path === '/api/routines' && options?.method === 'POST',
    )!
    const payload = JSON.parse(String(call[1]?.body))
    expect(payload.name).toBe('Chest and back')
    expect(payload.exercises[0].name).toBe('Incline chest press')
    expect(
      payload.exercises[0].options.map(
        (e: { exerciseId: string }) => e.exerciseId,
      ),
    ).toEqual(['cable', 'machine'])
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps save errors inside the dialog and handles native cancellation', async () => {
    failExerciseSave = true
    await openApp()
    navigate('Exercise library')
    const opener = screen.getByRole('button', { name: 'Add exercise' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Exercise editor' })
    fireEvent.change(within(dialog).getByLabelText('Exercise name'), {
      target: { value: 'Cable incline press' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save exercise' }),
    )
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'already in your library',
    )
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the rest timer running when a set is completed and saved', async () => {
    active = structuredClone(session)
    await openApp()
    vi.useFakeTimers()
    fireEvent.click(
      screen.getByRole('button', { name: 'Start rest timer at 1:30' }),
    )
    act(() => vi.advanceTimersByTime(2_000))
    expect(
      screen.getByRole('button', { name: 'Pause rest timer at 1:28' }),
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Weight (kg)'), {
      target: { value: '60' },
    })
    fireEvent.change(screen.getByLabelText('Reps / 8'), {
      target: { value: '8' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
    })
    expect(
      screen.getByRole('button', { name: 'Pause rest timer at 1:28' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '✓ Done' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(88_000))
    expect(screen.getByText('Rest complete')).toBeTruthy()
  })

  it('unlocks set logging only after choosing the actual movement', async () => {
    active = {
      ...session,
      exercises: [{ ...session.exercises[0], exerciseId: null }],
    }
    await openApp()
    expect(
      (screen.getByLabelText('Weight (kg)') as HTMLInputElement).disabled,
    ).toBe(true)
    fireEvent.change(
      screen.getByLabelText('Choose your exercise for this workout'),
      { target: { value: 'machine' } },
    )
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Weight (kg)') as HTMLInputElement).disabled,
      ).toBe(false),
    )
    expect(api).toHaveBeenCalledWith(
      '/api/sessions/session-1/exercises/slot-1/choice',
      {
        method: 'PUT',
        body: JSON.stringify({ exerciseId: 'machine', clearLoggedSets: false }),
      },
    )
  })

  it('charts completed sets only and lets the user inspect 7 or 28 days', () => {
    const finished: WorkoutSession = {
      ...session,
      completedAt: date,
      exercises: [
        {
          ...session.exercises[0],
          sets: [
            { ...set, completed: true },
            { ...set, id: 'not-done' },
          ],
        },
      ],
    }
    render(<TrainingChart history={[finished]} />)
    const day = screen.getByRole('button', {
      name: /1 completed sets, 1 workouts/,
    })
    fireEvent.click(day)
    expect(screen.getByText(/1 completed sets across 1 workout/)).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(9)
    fireEvent.click(screen.getByRole('button', { name: '28 days' }))
    expect(screen.getAllByRole('button')).toHaveLength(30)
    expect(
      screen
        .getByRole('button', { name: '28 days' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
