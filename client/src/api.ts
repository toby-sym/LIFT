export type ExerciseKind = 'strength' | 'bodyweight' | 'cardio'

export type ExerciseDefinition = {
  id: string
  name: string
  kind: ExerciseKind
  oneRepMaxKg: number | null
  createdAt: string
}

export type BodyweightEntry = {
  id: string
  weightKg: number
  measuredOn: string
  createdAt: string
}

export type RoutineExercise = {
  id: string
  name: string
  exerciseId: string | null
  options: { exerciseId: string | null; name: string; kind: ExerciseKind }[]
  sets: number
  targetReps: number
  section: 'work' | 'warmup' | 'cooldown'
  targetTempo: string | null
  targetHeartRateMin: number | null
  targetHeartRateMax: number | null
  targetResistanceLevel: number | null
  targetRpm: number | null
  targetDurationSeconds: number | null
}

export type Routine = {
  id: string
  name: string
  createdAt: string
  exercises: RoutineExercise[]
}

export type WorkoutSet = {
  id: string
  order: number
  targetReps: number
  weightKg: number | null
  bodyMassKg: number | null
  reps: number | null
  rpe: number | null
  rir: number | null
  actualTempo: string | null
  estimatedOneRmKg: number | null
  percentageOfOneRm: number | null
  targetDurationSeconds: number | null
  durationSeconds: number | null
  heartRateBpm: number | null
  resistanceLevel: number | null
  rpm: number | null
  completed: boolean
}

export type WorkoutSetInput = {
  weightKg: number | null
  reps: number | null
  completed: boolean
  rpe: number | null
  rir: number | null
  actualTempo: string | null
  durationSeconds: number | null
  heartRateBpm: number | null
  resistanceLevel: number | null
  rpm: number | null
}

export type WorkoutSession = {
  id: string
  routineId: string | null
  name: string
  startedAt: string
  completedAt: string | null
  notes: string
  rating: number | null
  ratingNote: string
  durationSeconds: number
  metrics: { totalReps: number; tonnageKg: number | null; tonnageComplete: boolean }
  exercises: {
    id: string
    name: string
    slotName: string
    exerciseId: string | null
    kind: ExerciseKind
    oneRepMaxKg: number | null
    section: 'work' | 'warmup' | 'cooldown'
    targetTempo: string | null
    targetHeartRateMin: number | null
    targetHeartRateMax: number | null
    targetResistanceLevel: number | null
    targetRpm: number | null
    options: { id: string; exerciseId: string | null; name: string; kind: ExerciseKind; oneRepMaxKg: number | null }[]
    sets: WorkoutSet[]
  }[]
}

export type Stats = {
  workouts: number
  weeklySets: number
  bests: { exerciseId: string | null; exercise: string; weightKg: number }[]
}

export type RoutineInput = {
  name: string
  exercises: {
    id?: string | null
    name: string
    exerciseId?: string | null
    options: { name: string; exerciseId?: string | null }[]
    sets: number
    targetReps: number
    section: 'work' | 'warmup' | 'cooldown'
    targetTempo?: string | null
    targetHeartRateMin?: number | null
    targetHeartRateMax?: number | null
    targetResistanceLevel?: number | null
    targetRpm?: number | null
    targetDurationSeconds?: number | null
  }[]
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const validation = body?.errors && Object.values(body.errors).flat().join(' ')
    throw new ApiError(validation || body?.message || body?.title || `Request failed (${response.status}).`, response.status)
  }

  if (response.status === 204) return null as T
  const body = await response.text()
  return (body ? JSON.parse(body) : null) as T
}

export const json = (value: unknown) => JSON.stringify(value)
