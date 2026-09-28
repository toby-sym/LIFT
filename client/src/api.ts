export type RoutineExercise = {
  id: string
  name: string
  sets: number
  targetReps: number
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
  reps: number | null
  completed: boolean
}

export type WorkoutSession = {
  id: string
  routineId: string | null
  name: string
  startedAt: string
  completedAt: string | null
  notes: string
  exercises: { id: string; name: string; sets: WorkoutSet[] }[]
}

export type Stats = {
  workouts: number
  weeklySets: number
  bests: { exercise: string; weightKg: number }[]
}

export type RoutineInput = {
  name: string
  exercises: { name: string; sets: number; targetReps: number }[]
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
