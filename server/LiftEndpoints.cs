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

        api.MapGet("/exercises", async (LiftDbContext db, ClaimsPrincipal user) =>
        {
            var exercises = await db.ExerciseLibrary.AsNoTracking()
                .Where(x => x.OwnerId == Owner(user))
                .OrderBy(x => x.Name)
                .ToListAsync();
            return Results.Ok(exercises.Select(ToResponse));
        });

        api.MapPost("/exercises", async (ExerciseLibraryInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var errors = Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var ownerId = Owner(user);
            var normalizedName = Normalize(input.Name);
            if (await db.ExerciseLibrary.AnyAsync(x => x.OwnerId == ownerId && x.NormalizedName == normalizedName))
                return Results.Conflict(new { message = "An exercise with that name already exists." });

            var exercise = new ExerciseDefinition
            {
                OwnerId = ownerId,
                Name = input.Name.Trim(),
                NormalizedName = normalizedName,
                Kind = input.Kind
            };
            db.ExerciseLibrary.Add(exercise);
            await db.SaveChangesAsync();
            return Results.Created($"/api/exercises/{exercise.Id}", ToResponse(exercise));
        });

        api.MapPut("/exercises/{id:guid}", async (Guid id, ExerciseLibraryInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var errors = Validate(input);
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var ownerId = Owner(user);
            var exercise = await db.ExerciseLibrary.FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == ownerId);
            if (exercise is null) return Results.NotFound();
            var normalizedName = Normalize(input.Name);
            if (await db.ExerciseLibrary.AnyAsync(x => x.OwnerId == ownerId && x.Id != id && x.NormalizedName == normalizedName))
                return Results.Conflict(new { message = "An exercise with that name already exists." });

            exercise.Name = input.Name.Trim();
            exercise.NormalizedName = normalizedName;
            exercise.Kind = input.Kind;
            await db.RoutineExerciseOptions.Where(x => x.ExerciseDefinitionId == id)
                .ExecuteUpdateAsync(update => update.SetProperty(x => x.Name, exercise.Name));
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(exercise));
        });

        api.MapDelete("/exercises/{id:guid}", async (Guid id, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var exercise = await db.ExerciseLibrary.FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == Owner(user));
            if (exercise is null) return Results.NotFound();
            if (await db.RoutineExercises.AnyAsync(x => x.ExerciseDefinitionId == id) ||
                await db.RoutineExerciseOptions.AnyAsync(x => x.ExerciseDefinitionId == id) ||
                await db.WorkoutExercises.AnyAsync(x => x.ExerciseDefinitionId == id) ||
                await db.WorkoutExerciseOptions.AnyAsync(x => x.ExerciseDefinitionId == id))
                return Results.Conflict(new { message = "This exercise is used by a routine or workout. Edit those records before removing it." });
            db.ExerciseLibrary.Remove(exercise);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        api.MapGet("/routines", async (LiftDbContext db, ClaimsPrincipal user) =>
        {
            var routines = await db.Routines.AsNoTracking()
                .Where(x => x.OwnerId == Owner(user))
                .Include(x => x.Exercises)
                    .ThenInclude(x => x.ExerciseDefinition)
                .Include(x => x.Exercises)
                    .ThenInclude(x => x.Options)
                        .ThenInclude(x => x.ExerciseDefinition)
                .OrderByDescending(x => x.CreatedAt)
                .ToListAsync();
            return Results.Ok(routines.Select(ToResponse));
        });

        api.MapPost("/routines", async (RoutineInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var errors = Validate(input);
            foreach (var error in ValidateExerciseOptions(input)) errors[error.Key] = error.Value;
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            if (await HasUnownedExerciseAsync(input.Exercises, db, Owner(user)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["exercises"] = ["Choose exercises from your own library."] });

            var routine = new Routine
            {
                OwnerId = Owner(user),
                Name = input.Name.Trim(),
                Exercises = await BuildExercisesAsync(input.Exercises, db, Owner(user))
            };
            foreach (var exercise in routine.Exercises) exercise.RoutineId = routine.Id;
            db.Routines.Add(routine);
            await db.SaveChangesAsync();
            return Results.Created($"/api/routines/{routine.Id}", ToResponse(routine));
        });

        api.MapPut("/routines/{id:guid}", async (Guid id, RoutineInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var errors = Validate(input);
            foreach (var error in ValidateExerciseOptions(input)) errors[error.Key] = error.Value;
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            if (await HasUnownedExerciseAsync(input.Exercises, db, Owner(user)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["exercises"] = ["Choose exercises from your own library."] });

            var routine = await db.Routines.Include(x => x.Exercises)
                    .ThenInclude(x => x.ExerciseDefinition)
                .Include(x => x.Exercises)
                    .ThenInclude(x => x.Options)
                        .ThenInclude(x => x.ExerciseDefinition)
                .FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == Owner(user));
            if (routine is null) return Results.NotFound();
            if (await HasInvalidSlotIdsAsync(input.Exercises, routine, db))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["exercises"] = ["An exercise slot does not belong to this routine."] });

            routine.Name = input.Name.Trim();
            var originalSlots = routine.Exercises.ToList();
            var replacements = await BuildExercisesAsync(input.Exercises, db, Owner(user), originalSlots);
            var retainedIds = replacements.Select(x => x.Id).ToHashSet();
            db.RoutineExercises.RemoveRange(originalSlots.Where(x => !retainedIds.Contains(x.Id)));
            foreach (var exercise in replacements) exercise.RoutineId = routine.Id;
            db.RoutineExercises.AddRange(replacements.Where(x => originalSlots.All(old => old.Id != x.Id)));
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
                    .ThenInclude(x => x.ExerciseDefinition)
                .Include(x => x.Exercises)
                    .ThenInclude(x => x.Options)
                        .ThenInclude(x => x.ExerciseDefinition)
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
                    RoutineSlotId = exercise.Id,
                    SlotName = exercise.Name,
                    ExerciseDefinitionId = exercise.Options.Count == 0 ? exercise.ExerciseDefinitionId : null,
                    Name = exercise.Options.Count == 0 ? exercise.ExerciseDefinition?.Name ?? exercise.Name : exercise.Name,
                    Options = new[]
                    {
                        new WorkoutExerciseOption
                        {
                            Order = 0,
                            ExerciseDefinitionId = exercise.ExerciseDefinitionId,
                            Name = exercise.ExerciseDefinition?.Name ?? exercise.Name,
                            Kind = exercise.ExerciseDefinition?.Kind ?? "strength"
                        }
                    }.Concat(exercise.Options.OrderBy(x => x.Order).Select(option => new WorkoutExerciseOption
                    {
                        Order = option.Order + 1,
                        ExerciseDefinitionId = option.ExerciseDefinitionId,
                        Name = option.ExerciseDefinition?.Name ?? option.Name,
                        Kind = option.ExerciseDefinition?.Kind ?? "strength"
                    })).ToList(),
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

        api.MapPut("/sessions/{id:guid}/exercises/{workoutExerciseId:guid}/choice", async (
            Guid id, Guid workoutExerciseId, ExerciseChoiceInput input, LiftDbContext db, ClaimsPrincipal user) =>
        {
            var session = await SessionQuery(db)
                .FirstOrDefaultAsync(x => x.Id == id && x.OwnerId == Owner(user) && x.CompletedAt == null);
            if (session is null) return Results.NotFound();
            var exercise = session.Exercises.FirstOrDefault(x => x.Id == workoutExerciseId);
            if (exercise is null) return Results.NotFound();
            var choice = exercise.Options.FirstOrDefault(x => x.ExerciseDefinitionId == input.ExerciseId);
            if (choice is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["exerciseId"] = ["Choose one of the options saved for this workout."] });
            if (exercise.ExerciseDefinitionId == choice.ExerciseDefinitionId) return Results.Ok(ToResponse(session));

            var hasLoggedValues = exercise.Sets.Any(x => x.Completed || x.WeightKg.HasValue || x.Reps.HasValue);
            if (hasLoggedValues && !input.ClearLoggedSets)
                return Results.Conflict(new { message = "Changing this exercise clears its logged sets. Confirm the change to continue." });
            if (input.ClearLoggedSets)
            {
                foreach (var set in exercise.Sets)
                {
                    set.WeightKg = null;
                    set.Reps = null;
                    set.Completed = false;
                }
            }
            exercise.ExerciseDefinitionId = choice.ExerciseDefinitionId;
            exercise.ExerciseDefinition = choice.ExerciseDefinition;
            exercise.Name = choice.Name;
            await db.SaveChangesAsync();
            return Results.Ok(ToResponse(session));
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
            var exercise = session.Exercises.First(x => x.Sets.Any(s => s.Id == setId));
            if (exercise.ExerciseDefinitionId is null)
                return Results.Conflict(new { message = "Choose an exercise option before logging sets." });

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
                    .Select(s => new { e.ExerciseDefinitionId, e.Name, s.WeightKg }))
                .GroupBy(x => x.ExerciseDefinitionId?.ToString() ?? Normalize(x.Name), StringComparer.Ordinal)
                .Select(g => new { exerciseId = g.First().ExerciseDefinitionId, exercise = g.First().Name, weightKg = g.Max(x => x.WeightKg) })
                .OrderBy(x => x.exercise)
                .ToList();
            return Results.Ok(new { workouts = sessions.Count, weeklySets, bests });
        });
    }

    private static string Owner(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;

    private static IQueryable<WorkoutSession> SessionQuery(LiftDbContext db) =>
        db.WorkoutSessions
            .Include(x => x.Exercises).ThenInclude(x => x.Sets)
            .Include(x => x.Exercises).ThenInclude(x => x.ExerciseDefinition)
            .Include(x => x.Exercises).ThenInclude(x => x.Options).ThenInclude(x => x.ExerciseDefinition)
            .AsSplitQuery();

    private static async Task<List<RoutineExercise>> BuildExercisesAsync(
        List<ExerciseInput> exercises, LiftDbContext db, string ownerId, List<RoutineExercise>? existing = null)
    {
        var result = new List<RoutineExercise>();
        var existingById = existing?.ToDictionary(x => x.Id) ?? [];
        for (var order = 0; order < exercises.Count; order++)
        {
            var input = exercises[order];
            var slot = input.Id is Guid slotId && existingById.Remove(slotId, out var current)
                ? current
                : new RoutineExercise { Name = "" };
            var requestedOptions = input.Options is { Count: > 0 }
                ? input.Options
                : [new ExerciseOptionInput(input.Name, input.ExerciseId)];
            var resolved = new List<ExerciseDefinition>();
            foreach (var option in requestedOptions)
            {
                var optionName = option.Name.Trim();
                var normalizedName = Normalize(optionName);
                var libraryExercise = option.ExerciseId is Guid exerciseId
                    ? await db.ExerciseLibrary.FirstOrDefaultAsync(x => x.Id == exerciseId && x.OwnerId == ownerId)
                    : db.ExerciseLibrary.Local.FirstOrDefault(x => x.OwnerId == ownerId && x.NormalizedName == normalizedName);
                libraryExercise ??= db.ExerciseLibrary.Local.FirstOrDefault(x => x.OwnerId == ownerId && x.NormalizedName == normalizedName);
                libraryExercise ??= await db.ExerciseLibrary.FirstOrDefaultAsync(x =>
                    x.OwnerId == ownerId && x.NormalizedName == normalizedName);
                if (libraryExercise is null)
                {
                    libraryExercise = new ExerciseDefinition
                    {
                        OwnerId = ownerId,
                        Name = optionName,
                        NormalizedName = normalizedName,
                        Kind = "strength"
                    };
                    db.ExerciseLibrary.Add(libraryExercise);
                }
                if (resolved.All(x => x.Id != libraryExercise.Id)) resolved.Add(libraryExercise);
            }
            if (resolved.Count == 0) continue;

            slot.Order = order;
            slot.Name = input.Name.Trim();
            slot.ExerciseDefinitionId = resolved[0].Id;
            slot.ExerciseDefinition = resolved[0];
            slot.Sets = input.Sets;
            slot.TargetReps = input.TargetReps;
            var priorOptions = slot.Options.OrderBy(x => x.Order).ToList();
            var nextOptions = resolved.Skip(1).Select((definition, optionOrder) =>
            {
                var option = optionOrder < priorOptions.Count ? priorOptions[optionOrder] : new RoutineExerciseOption { Name = definition.Name };
                option.Order = optionOrder;
                option.ExerciseDefinitionId = definition.Id;
                option.ExerciseDefinition = definition;
                option.Name = definition.Name;
                return option;
            }).ToList();
            db.RoutineExerciseOptions.RemoveRange(priorOptions.Skip(nextOptions.Count));
            slot.Options = nextOptions;
            result.Add(slot);
        }
        return result;
    }

    private static async Task<bool> HasUnownedExerciseAsync(List<ExerciseInput> exercises, LiftDbContext db, string ownerId)
    {
        var ids = exercises.SelectMany(x => x.Options is { Count: > 0 }
                ? x.Options.Where(o => o.ExerciseId.HasValue).Select(o => o.ExerciseId!.Value)
                : x.ExerciseId.HasValue ? [x.ExerciseId.Value] : [])
            .Distinct().ToList();
        if (ids.Count == 0) return false;
        return await db.ExerciseLibrary.CountAsync(x => x.OwnerId == ownerId && ids.Contains(x.Id)) != ids.Count;
    }

    private static async Task<bool> HasInvalidSlotIdsAsync(List<ExerciseInput> exercises, Routine routine, LiftDbContext db)
    {
        var ids = exercises.Where(x => x.Id.HasValue).Select(x => x.Id!.Value).Distinct().ToList();
        if (ids.Count == 0) return false;
        var existingIds = routine.Exercises.Select(x => x.Id).ToHashSet();
        if (ids.Any(x => !existingIds.Contains(x))) return true;
        return await db.RoutineExercises.CountAsync(x => ids.Contains(x.Id) && x.RoutineId == routine.Id) != ids.Count;
    }

    private static string Normalize(string value) => value.Trim().ToUpperInvariant();

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

    private static Dictionary<string, string[]> ValidateExerciseOptions(RoutineInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (input.Exercises is null) return errors;
        foreach (var slot in input.Exercises)
        {
            if (slot is null) continue;
            var options = slot.Options is { Count: > 0 }
                ? slot.Options
                : [new ExerciseOptionInput(slot.Name, slot.ExerciseId)];
            if (options.Count is < 1 or > 8 || options.Any(x => x is null || string.IsNullOrWhiteSpace(x.Name) || x.Name.Trim().Length > 100))
            {
                errors["exercises"] = ["Each slot needs 1 to 8 named exercise options."];
                return errors;
            }
            var optionNames = options.Select(x => Normalize(x.Name));
            var optionIds = options.Where(x => x.ExerciseId.HasValue).Select(x => x.ExerciseId!.Value).ToList();
            if (optionNames.Distinct(StringComparer.Ordinal).Count() != optionNames.Count() || optionIds.Distinct().Count() != optionIds.Count)
            {
                errors["exercises"] = ["An exercise option cannot appear more than once in a slot."];
                return errors;
            }
        }
        var slotIds = input.Exercises.Where(x => x.Id.HasValue).Select(x => x.Id!.Value).ToList();
        if (slotIds.Distinct().Count() != slotIds.Count)
            errors["exercises"] = ["An exercise slot cannot appear more than once in a routine."];
        return errors;
    }

    private static Dictionary<string, string[]> Validate(ExerciseLibraryInput input)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 100)
            errors["name"] = ["Name must be 1 to 100 characters."];
        if (input.Kind is not ("strength" or "bodyweight" or "cardio"))
            errors["kind"] = ["Choose strength, bodyweight, or cardio."];
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
            x.Id, x.Name, exerciseId = x.ExerciseDefinitionId, x.Sets, x.TargetReps,
            options = new[]
            {
                new { exerciseId = x.ExerciseDefinitionId, name = x.ExerciseDefinition?.Name ?? x.Name, kind = x.ExerciseDefinition?.Kind ?? "strength" }
            }.Concat(x.Options.OrderBy(o => o.Order).Select(o => new
            {
                exerciseId = o.ExerciseDefinitionId,
                name = o.ExerciseDefinition?.Name ?? o.Name,
                kind = o.ExerciseDefinition?.Kind ?? "strength"
            }))
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
            x.Id, x.Name, slotName = x.SlotName ?? x.Name, exerciseId = x.ExerciseDefinitionId,
            options = x.Options.OrderBy(o => o.Order).Select(o => new
            {
                o.Id, exerciseId = o.ExerciseDefinitionId, o.Name, o.Kind
            }),
            sets = x.Sets.OrderBy(s => s.Order).Select(s => new
            {
                s.Id, s.Order, s.TargetReps, s.WeightKg, s.Reps, s.Completed
            })
        })
    };

    private static object ToResponse(ExerciseDefinition exercise) => new
    {
        exercise.Id,
        exercise.Name,
        exercise.Kind,
        exercise.CreatedAt
    };
}

public sealed record ExerciseInput(string Name, int Sets, int TargetReps, Guid? ExerciseId = null, Guid? Id = null, List<ExerciseOptionInput>? Options = null);
public sealed record ExerciseOptionInput(string Name, Guid? ExerciseId = null);
public sealed record ExerciseLibraryInput(string Name, string Kind);
public sealed record RoutineInput(string Name, List<ExerciseInput> Exercises);
public sealed record StartSessionInput(Guid RoutineId);
public sealed record ExerciseChoiceInput(Guid ExerciseId, bool ClearLoggedSets = false);
public sealed record SetInput(decimal? WeightKg, int? Reps, bool Completed);
public sealed record NotesInput(string Notes);
