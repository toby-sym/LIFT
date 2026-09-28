# LIFT

LIFT is a personal training journal with a React, TypeScript and Tailwind frontend, an ASP.NET Core API, ASP.NET Core Identity, EF Core and PostgreSQL.

## Run locally

You need .NET 10, Node.js 24 (or a Vite compatible version), npm and PostgreSQL. The included Compose file starts a local PostgreSQL database if Docker Desktop is available.

From the repository root:

```powershell
docker compose up -d db
dotnet tool restore
dotnet tool run dotnet-ef database update --project server --startup-project server
dotnet run --project server --launch-profile http
```

In a second terminal:

```powershell
npm ci --prefix client
npm run dev --prefix client
```

Open <http://localhost:5173>. Vite forwards account and API requests to the C# server at `http://localhost:5294`. The local database credentials are in `compose.yaml` and `server/appsettings.Development.json`; they are for development only. If you use an existing PostgreSQL instance, change the development connection string before applying migrations.

## Features

### Routines and exercise choices

- Create routines with up to 20 ordered exercise slots, set and rep targets, a warm-up / working / cool-down section, and an optional target tempo such as `3-1-1`.
- Add up to eight alternatives to a slot. For example, an “Incline chest press” slot can offer cable and machine presses. The user picks one option for each workout; set and rep targets are shared by the choices.
- Keep a private exercise library and classify movements as loaded strength, bodyweight or cardio. Routine choices can use library entries or custom names.
- Group 2–8 slots to train as a superset (2), tri-set (3) or giant set (4 or more).
- Start a workout from a routine, or log an individual workout. Changing an exercise choice after logging sets asks before clearing those sets.

### Workout logging and metrics

- Record load, reps, completion and optional RPE / RIR for each strength or bodyweight set. Bodyweight sets can also record added load. Completed bodyweight sets save the user's current body mass as a snapshot so later bodyweight edits do not rewrite workout history.
- Total reps and tonnage are separate metrics. Total reps sums reps from completed strength and bodyweight sets. Tonnage sums effective load multiplied by reps; for bodyweight sets, effective load is body mass plus added load. Tonnage is marked partial if any completed set lacks an effective load, including a missing bodyweight snapshot. Cardio intervals are not included in strength tonnage.
- Add an entered 1RM per exercise, or see an estimated 1RM and working load percentage based on the logged reps and RPE. Estimates use a generalized RPE chart for 1–12 reps at RPE 6–10 and should be treated as estimates.
- Record optional actual tempo, exercise notes, workout rating and note. Session duration is tracked, and a 90-second rest timer is available between sets.
- Log cardio intervals manually with duration, heart rate, resistance and RPM. Routines can prescribe a target duration, heart-rate range, resistance or RPM. There is no live device integration.

### History and progress

- Browse completed workouts and weekly completed-set totals.
- View personal records for heaviest effective load, most reps at a load, estimated 1RM and complete session tonnage.
- View per-exercise history charts for load, reps, estimated 1RM and volume.
- Record body mass over time and see its trend.
- Compare two sessions of the same routine by overall totals and aligned routine slots. Different choices within a slot remain distinct in the comparison.

### Accounts and data

Sign-up, sign-in and sign-out use ASP.NET Core Identity. Each API operation scopes routines, exercises, body-mass entries and workout history to the signed-in account. Identity cookies are HTTP-only and SameSite Strict.

## Deployment

The UI and API use the same origin in production. Set `ConnectionStrings__Lift` in the server environment and apply all EF Core migrations before starting a new deployment:

```powershell
$env:ConnectionStrings__Lift = 'Host=YOUR_HOST;Database=lift;Username=YOUR_USER;Password=YOUR_PASSWORD'
dotnet tool run dotnet-ef database update --project server --startup-project server
```

`Dockerfile` builds the React app and hosts it from the ASP.NET Core app on port 8080. Put that container behind HTTPS and provide the PostgreSQL connection string through your deployment platform. The repository does not include a hosted environment or database credentials.

## Checks

```powershell
dotnet test tests/Lift.Api.Tests.csproj --configuration Release
npm run build --prefix client
npm run lint --prefix client
```

The API tests use an in-memory SQLite database for account ownership, routine alternatives, workout logging and feature calculations. Production migrations target PostgreSQL.

## Feature branch history

Features were developed on focused branches and merged into local `main` with merge commits. Commit subjects describe each change:

| Branch | Feature commit |
| --- | --- |
| `feature/ui-overhaul` | Redesign the workout dashboard and logging screens |
| `feature/exercise-library` | Add a personal exercise library |
| `feature/routine-exercise-options` | Add alternative exercises to routine slots |
| `feature/bodyweight-tracking` | Track bodyweight entries and show their trend |
| `feature/strength-set-logging` | Support bodyweight sets and calculate workout totals |
| `feature/session-experience` | Add workout ratings tempo and rest timing |
| `feature/percentage-and-e1rm` | Add estimated one rep max and load percentages |
| `feature/cardio-tracking` | Track manual cardio targets and intervals |
| `feature/exercise-groups` | Group routine exercises into training sets |
| `feature/records-and-progress` | Track personal records and exercise progress |
| `feature/session-comparison` | Compare repeated routine sessions |

## GitHub Actions

`.github/workflows/ci.yml` runs on every push and pull request, and can also be started manually from GitHub Actions. GitHub-hosted Ubuntu runners start a temporary PostgreSQL service, apply the EF Core migrations, run the API tests, lint and build the frontend, then build the combined Docker image. A push to the repository's default branch also uploads the image as a 7-day workflow artifact. This provides CI and a downloadable build without a deployment environment.
