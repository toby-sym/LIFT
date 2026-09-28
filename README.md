# LIFT

A small training journal with a React, TypeScript and Tailwind frontend, an ASP.NET Core API, ASP.NET Core Identity, EF Core and PostgreSQL.

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

Open <http://localhost:5173>. Vite forwards account and API requests to the C# server at `http://localhost:5294`. The local database credentials are in `compose.yaml` and `server/appsettings.Development.json`; they are for development only. If you use an existing PostgreSQL instance, change the development connection string before applying the migration.

## What is included

- Email and password sign up, sign in and sign out through ASP.NET Core Identity.
- Private routines with exercise names, set counts and rep targets.
- An active workout copied from a routine, with saved weights, reps, completion flags and notes.
- Finished workout history, weekly completed sets and per-exercise best weights.
- A first EF Core migration. The API takes the owner from the signed-in account for every data operation.

The UI and API use the same origin in production. Identity cookies are HTTP-only and SameSite Strict. Set `ConnectionStrings__Lift` in the server environment for any non-development database. Apply migrations separately before starting a new deployment:

```powershell
$env:ConnectionStrings__Lift = 'Host=YOUR_HOST;Database=lift;Username=YOUR_USER;Password=YOUR_PASSWORD'
dotnet tool run dotnet-ef database update --project server --startup-project server
```

`Dockerfile` builds the React app and hosts it from the ASP.NET Core app on port 8080. Put that container behind HTTPS and provide the PostgreSQL connection string through your deployment platform. The repository does not include a hosted environment or database credentials.

## Checks

```powershell
dotnet test tests/Lift.Api.Tests.csproj
npm run build --prefix client
npm run lint --prefix client
```

The API test uses an in-memory SQLite database to check the account, routine and workout flow, including ownership isolation. The generated migration targets PostgreSQL.

## GitHub Actions

`.github/workflows/ci.yml` runs on every push and pull request, and can also be started manually from GitHub Actions. GitHub-hosted Ubuntu runners start a temporary PostgreSQL service, apply the EF Core migration, run the API tests, lint and build the frontend, then build the combined Docker image. A push to the repository's default branch also uploads the image as a 7-day workflow artifact. This provides CI and a downloadable build without a deployment environment.
