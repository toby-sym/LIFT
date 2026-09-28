using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Lift.Api;

public static class LiftEndpoints
{
    public static void MapLiftEndpoints(this WebApplication app)
    {
        app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

        var api = app.MapGroup("/api").RequireAuthorization();
        api.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new { email = user.FindFirstValue(ClaimTypes.Email) }));
        api.MapPost("/auth/logout", async (SignInManager<IdentityUser> signInManager) =>
        {
            await signInManager.SignOutAsync();
            return Results.NoContent();
        });

        api.MapGet("/routines", async (LiftDbContext db, ClaimsPrincipal user) =>
        {
            var routines = await db.Routines.AsNoTracking()
                .Where(x => x.OwnerId == Owner(user))
                .Include(x => x.Exercises)
                .OrderByDescending(x => x.CreatedAt)
                .ToListAsync();
            return Results.Ok(routines.Select(ToResponse));
        });

        api.MapPost("/routines", async (RoutineInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var errors = Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var routine = new Routine
            {
                OwnerId = Owner(user),
                Name = input.Name.Trim(),
                Exercises = BuildExercises(input.Exercises)
            };
            db.Routines.Add(routine);
            await db.SaveChangesAsync();
            return Results.Created($"/api/routines/{routine.Id}", ToResponse(routine));
        });

        api.MapPut("/routines/{id:guid}", async (Guid id, RoutineInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var errors = Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var routine = await db.Routines.Include(x => x.Exercises)
                .FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == Owner(user));
            if (routine is null) return Results.NotFound();

            routine.Name = input.Name.Trim();
            db.RoutineExercises.RemoveRange(routine.Exercises);
            var replacements = BuildExercises(input.Exercises);
            foreach (var exercise in replacements) exercise.RoutineId = routine.Id;
            db.RoutineExercises.AddRange(replacements);
            routine.Exercises = replacements;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(routine));
        });

        api.MapDelete("/routines/{id:guid}", async (Guid id, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var routine = await db.Routines.FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == Owner(user));
            if (routine is null) return Results.NotFound();
            db.Routines.Remove(routine);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        api.MapGet("/sessions/active", async (LiftDbContext db, ClaimsPrincipal user) =>
        {
            var session = await SessionQuery(db)
                .Where(x => x.OwnerId == Owner(user) && x.CompletedAt == null)
                .OrderByDescending(x => x.StartedAt)
                .FirstOrDefaultAsync();
            return session is null ? Results.NoContent() : Results.Ok(ToResponse(session));
        });

        api.MapGet("/sessions/history", async (LiftDbContext db, ClaimsPrincipal user) =>
        {
            var sessions = await SessionQuery(db)
                .Where(x => x.OwnerId == Owner(user) && x.CompletedAt != null)
                .OrderByDescending(x => x.CompletedAt)
                .Take(30)
                .ToListAsync();
            return Results.Ok(sessions.Select(ToResponse));
        });

        api.MapPost("/sessions", async (StartSessionInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var ownerId = Owner(user);
            if (await db.WorkoutSessions.AnyAsync(x => x.OwnerId == ownerId && x.CompletedAt == null))
                return Results.Conflict(new { message = "Finish or discard your current workout first." });

            var routine = await db.Routines.AsNoTracking().Include(x => x.Exercises)
                .FirstOrDefaultAsync(x => x.Id == input.RoutineId && x.OwnerId == ownerId);
            if (routine is null) return Results.NotFound();

            var session = new WorkoutSession
            {
                OwnerId = ownerId,
                RoutineId = routine.Id,
                Name = routine.Name,
                Exercises = routine.Exercises.OrderBy(x => x.Order).Select((exercise, order) => new WorkoutExercise
                {
                    Order = order,
                    Name = exercise.Name,
                    Sets = Enumerable.Range(0, exercise.Sets).Select(setOrder => new WorkoutSet
                    {
                        Order = setOrder,
                        TargetReps = exercise.TargetReps
                    }).ToList()
                }).ToList()
            };
            db.WorkoutSessions.Add(session);
            await db.SaveChangesAsync();
            return Results.Created($"/api/sessions/{session.Id}", ToResponse(session));
        });

        api.MapPut("/sessions/{id:guid}/sets/{setId:guid}", async (
            Guid id, Guid setId, SetInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var errors = Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var session = await SessionQuery(db)
                .FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == Owner(user) && x.CompletedAt == null);
            if (session is null) return Results.NotFound();
            var set = session.Exercises.SelectMany(x => x.Sets).FirstOrDefault(x => x.Id == setId);
            if (set is null) return Results.NotFound();

            set.WeightKg = input.WeightKg;
            set.Reps = input.Reps;
            set.Completed = input.Completed;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(session));
        });

        api.MapPut("/sessions/{id:guid}/notes", async (
            Guid id, NotesInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            if (input.Notes is null || input.Notes.Length > 2000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["notes"] = ["Notes must be 2,000 characters or fewer."] });
            var session = await db.WorkoutSessions.FirstOrDefaultAsync(x =>
                x.Id == id && x.OwnerId == Owner(user) && x.CompletedAt == null);
            if (session is null) return Results.NotFound();
            session.Notes = input.Notes.Trim();
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        api.MapPost("/sessions/{id:guid}/finish", async (Guid id, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var session = await SessionQuery(db)
                .FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == Owner(user) && x.CompletedAt == null);
            if (session is null) return Results.NotFound();
            if (!session.Exercises.SelectMany(x => x.Sets).Any(x => x.Completed))
                return Results.BadRequest(new { message = "Complete at least one set before finishing." });
            session.CompletedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(session));
        });

        api.MapDelete("/sessions/{id:guid}", async (Guid id, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var session = await db.WorkoutSessions.FirstOrDefaultAsync(x =>
                x.Id == id && x.OwnerId == Owner(user) && x.CompletedAt == null);
            if (session is null) return Results.NotFound();
            db.WorkoutSessions.Remove(session);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        api.MapGet("/stats", async (LiftDbContext db, ClaimsPrincipal user) =>
        {
            var sessions = await SessionQuery(db)
                .Where(x => x.OwnerId == Owner(user) && x.CompletedAt != null)
                .ToListAsync();
            var today = DateTime.UtcNow.Date;
            var monday = today.AddDays(-((int)today.DayOfWeek + 6) % 7);
            var weeklySets = sessions.Where(x => x.CompletedAt >= monday)
                .Sum(x => x.Exercises.Sum(e => e.Sets.Count(s => s.Completed)));
            var bests = sessions.SelectMany(x => x.Exercises)
                .SelectMany(e => e.Sets.Where(s => s.Completed && s.WeightKg.HasValue)
                    .Select(s => new { e.Name, s.WeightKg }))
                .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
                .Select(g => new { exercise = g.First().Name, weightKg = g.Max(x => x.WeightKg) })
                .OrderBy(x => x.exercise)
                .ToList();
            return Results.Ok(new { workouts = sessions.Count, weeklySets, bests });
        });
    }

    private static string Owner(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private static IQueryable<WorkoutSession> SessionQuery(LiftDbContext db) =>
        db.WorkoutSessions.Include(x => x.Exercises).ThenInclude(x => x.Sets).AsSplitQuery();

    private static List<RoutineExercise> BuildExercises(List<ExerciseInput> exercises) =>
        exercises.Select((exercise, order) => new RoutineExercise
        {
            Order = order,
            Name = exercise.Name.Trim(),
            Sets = exercise.Sets,
            TargetReps = exercise.TargetReps
        }).ToList();

    private static Dictionary<string, string[]> Validate(RoutineInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 100)
            errors["name"] = ["Name must be 1 to 100 characters."];
        if (input.Exercises is null || input.Exercises.Count is < 1 or > 20)
            errors["exercises"] = ["Add 1 to 20 exercises."];
        else if (input.Exercises.Any(x => x is null || string.IsNullOrWhiteSpace(x.Name) ||
                     x.Name.Trim().Length > 100 || x.Sets is < 1 or > 10 || x.TargetReps is < 1 or > 100))
            errors["exercises"] = ["Each exercise needs a name, 1–10 sets and a target of 1–100 reps."];
        return errors;
    }

    private static Dictionary<string, string[]> Validate(SetInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (input.WeightKg is < 0 or > 9999.99m)
            errors["weightKg"] = ["Weight must be between 0 and 9,999.99 kg."];
        if (input.Reps is < 0 or > 1000)
            errors["reps"] = ["Reps must be between 0 and 1,000."];
        if (input.Completed && (input.Reps is null or < 1 || input.WeightKg is null))
            errors["completed"] = ["Enter weight and at least one rep to complete a set."];
        return errors;
    }

    private static object ToResponse(Routine routine) => new
    {
        routine.Id,
        routine.Name,
        routine.CreatedAt,
        exercises = routine.Exercises.OrderBy(x => x.Order).Select(x => new
        {
            x.Id, x.Name, x.Sets, x.TargetReps
        })
    };

    private static object ToResponse(WorkoutSession session) => new
    {
        session.Id,
        session.RoutineId,
        session.Name,
        session.StartedAt,
        session.CompletedAt,
        session.Notes,
        exercises = session.Exercises.OrderBy(x => x.Order).Select(x => new
        {
            x.Id, x.Name,
            sets = x.Sets.OrderBy(s => s.Order).Select(s => new
            {
                s.Id, s.Order, s.TargetReps, s.WeightKg, s.Reps, s.Completed
            })
        })
    };
}

public sealed record ExerciseInput(string Name, int Sets, int TargetReps);
public sealed record RoutineInput(string Name, List<ExerciseInput> Exercises);
public sealed record StartSessionInput(Guid RoutineId);
public sealed record SetInput(decimal? WeightKg, int? Reps, bool Completed);
public sealed record NotesInput(string Notes);
