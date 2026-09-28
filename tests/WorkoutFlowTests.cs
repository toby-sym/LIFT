using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Lift.Api;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Lift.Api.Tests;

public sealed class WorkoutFlowTests
{
    [Fact]
    public async Task A_completed_workout_is_saved_and_private_to_its_owner()
    {
        using var factory = new LiftFactory();
        using var anonymous = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        factory.Initialize();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/routines")).StatusCode);

        using var alice = factory.CreateClient();
        await RegisterAndSignIn(alice, "alice@example.com");

        var invalidRoutine = await alice.PostAsJsonAsync("/api/routines", new
        {
            name = "Bad plan",
            exercises = new[] { new { name = "Bench press", sets = 0, targetReps = 8 } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidRoutine.StatusCode);

        var create = await alice.PostAsJsonAsync("/api/routines", new
        {
            name = "Upper A",
            exercises = new[] { new { name = "Bench press", sets = 2, targetReps = 8 } }
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var routine = await create.Content.ReadFromJsonAsync<JsonElement>();
        var routineId = routine.GetProperty("id").GetString();
        var linkedExerciseId = routine.GetProperty("exercises")[0].GetProperty("exerciseId").GetString();

        var library = await alice.GetFromJsonAsync<JsonElement>("/api/exercises");
        Assert.Single(library.EnumerateArray());
        Assert.Equal(linkedExerciseId, library[0].GetProperty("id").GetString());
        Assert.Equal("strength", library[0].GetProperty("kind").GetString());

        var duplicateExercise = await alice.PostAsJsonAsync("/api/exercises", new { name = " bench PRESS ", kind = "strength" });
        Assert.Equal(HttpStatusCode.Conflict, duplicateExercise.StatusCode);
        var bodyweightExercise = await alice.PostAsJsonAsync("/api/exercises", new { name = "Pull-up", kind = "bodyweight" });
        Assert.Equal(HttpStatusCode.Created, bodyweightExercise.StatusCode);
        var bodyweight = await bodyweightExercise.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("bodyweight", bodyweight.GetProperty("kind").GetString());
        var renameExercise = await alice.PutAsJsonAsync($"/api/exercises/{bodyweight.GetProperty("id").GetString()}", new { name = "Chin-up", kind = "bodyweight" });
        Assert.Equal(HttpStatusCode.OK, renameExercise.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync($"/api/exercises/{bodyweight.GetProperty("id").GetString()}")).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await alice.PostAsJsonAsync("/api/bodyweight", new
        {
            weightKg = 501, measuredOn = DateOnly.FromDateTime(DateTime.UtcNow)
        })).StatusCode);
        var bodyweightEntryResponse = await alice.PostAsJsonAsync("/api/bodyweight", new
        {
            weightKg = 78.4m, measuredOn = DateOnly.FromDateTime(DateTime.UtcNow)
        });
        Assert.Equal(HttpStatusCode.Created, bodyweightEntryResponse.StatusCode);
        var bodyweightEntry = await bodyweightEntryResponse.Content.ReadFromJsonAsync<JsonElement>();
        var bodyweightEntryId = bodyweightEntry.GetProperty("id").GetString();
        Assert.Equal(78.4m, bodyweightEntry.GetProperty("weightKg").GetDecimal());
        var bodyweightUpdate = await alice.PutAsJsonAsync($"/api/bodyweight/{bodyweightEntryId}", new
        {
            weightKg = 77.9m, measuredOn = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1))
        });
        Assert.Equal(HttpStatusCode.OK, bodyweightUpdate.StatusCode);
        Assert.Equal(77.9m, (await bodyweightUpdate.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("weightKg").GetDecimal());

        var start = await alice.PostAsJsonAsync("/api/sessions", new { routineId });
        Assert.Equal(HttpStatusCode.Created, start.StatusCode);
        var session = await start.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetString();
        var setId = session.GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("id").GetString();

        var log = await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 60, reps = 8, completed = true
        });
        Assert.Equal(HttpStatusCode.OK, log.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/notes", new { notes = "Good session" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await alice.PostAsync($"/api/sessions/{sessionId}/finish", null)).StatusCode);

        var edit = await alice.PutAsJsonAsync($"/api/routines/{routineId}", new
        {
            name = "Upper B",
            exercises = new[] { new { name = "Incline press", sets = 3, targetReps = 10 } }
        });
        Assert.True(edit.StatusCode == HttpStatusCode.OK, await edit.Content.ReadAsStringAsync());

        var historyResponse = await alice.GetAsync("/api/sessions/history");
        Assert.True(historyResponse.IsSuccessStatusCode, await historyResponse.Content.ReadAsStringAsync());
        var history = await historyResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Upper A", history[0].GetProperty("name").GetString());
        Assert.Equal("Bench press", history[0].GetProperty("exercises")[0].GetProperty("name").GetString());
        Assert.Equal("Good session", history[0].GetProperty("notes").GetString());
        var stats = await alice.GetFromJsonAsync<JsonElement>("/api/stats");
        Assert.Equal(1, stats.GetProperty("workouts").GetInt32());
        Assert.Equal(60m, stats.GetProperty("bests")[0].GetProperty("weightKg").GetDecimal());

        using var bob = factory.CreateClient();
        await RegisterAndSignIn(bob, "bob@example.com");
        Assert.Empty((await bob.GetFromJsonAsync<JsonElement>("/api/routines")).EnumerateArray());
        Assert.Empty((await bob.GetFromJsonAsync<JsonElement>("/api/exercises")).EnumerateArray());
        Assert.Empty((await bob.GetFromJsonAsync<JsonElement>("/api/bodyweight")).EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/api/bodyweight/{bodyweightEntryId}")).StatusCode);
        Assert.Empty((await bob.GetFromJsonAsync<JsonElement>("/api/sessions/history")).EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PostAsJsonAsync("/api/sessions", new { routineId })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"/api/routines/{routineId}", new
        {
            name = "Stolen", exercises = new[] { new { name = "Squat", sets = 3, targetReps = 5 } }
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 100, reps = 10, completed = true
        })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync($"/api/bodyweight/{bodyweightEntryId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await alice.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await alice.GetAsync("/api/routines")).StatusCode);
    }

    [Fact]
    public async Task A_routine_can_offer_alternatives_and_a_session_saves_the_selected_exercise()
    {
        using var factory = new LiftFactory();
        factory.Initialize();
        using var alice = factory.CreateClient();
        await RegisterAndSignIn(alice, "alternatives@example.com");

        var cableResponse = await alice.PostAsJsonAsync("/api/exercises", new { name = "Cable incline press", kind = "strength", oneRepMaxKg = 100m });
        var machineResponse = await alice.PostAsJsonAsync("/api/exercises", new { name = "Machine incline press", kind = "strength", oneRepMaxKg = 120m });
        Assert.Equal(HttpStatusCode.Created, cableResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, machineResponse.StatusCode);
        var cable = await cableResponse.Content.ReadFromJsonAsync<JsonElement>();
        var machine = await machineResponse.Content.ReadFromJsonAsync<JsonElement>();
        var cableId = cable.GetProperty("id").GetString();
        var machineId = machine.GetProperty("id").GetString();

        var createRoutine = await alice.PostAsJsonAsync("/api/routines", new
        {
            name = "Upper A",
            exercises = new[]
            {
                new
                {
                    name = "Incline chest press", sets = 2, targetReps = 8,
                    options = new[]
                    {
                        new { name = "Cable incline press", exerciseId = cableId },
                        new { name = "Machine incline press", exerciseId = machineId }
                    }
                }
            }
        });
        Assert.Equal(HttpStatusCode.Created, createRoutine.StatusCode);
        var routine = await createRoutine.Content.ReadFromJsonAsync<JsonElement>();
        var routineId = routine.GetProperty("id").GetString();
        var slotId = routine.GetProperty("exercises")[0].GetProperty("id").GetString();
        Assert.Equal(2, routine.GetProperty("exercises")[0].GetProperty("options").GetArrayLength());

        var start = await alice.PostAsJsonAsync("/api/sessions", new { routineId });
        Assert.Equal(HttpStatusCode.Created, start.StatusCode);
        var session = await start.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetString();
        var sessionExercise = session.GetProperty("exercises")[0];
        var workoutExerciseId = sessionExercise.GetProperty("id").GetString();
        Assert.Null(sessionExercise.GetProperty("exerciseId").GetString());
        Assert.Equal(2, sessionExercise.GetProperty("options").GetArrayLength());
        var setId = sessionExercise.GetProperty("sets")[0].GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.Conflict, (await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 25, reps = 8, completed = true
        })).StatusCode);

        var chooseCable = await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/exercises/{workoutExerciseId}/choice", new
        {
            exerciseId = cableId, clearLoggedSets = false
        });
        Assert.Equal(HttpStatusCode.OK, chooseCable.StatusCode);
        var cableSession = await chooseCable.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(cableId, cableSession.GetProperty("exercises")[0].GetProperty("exerciseId").GetString());
        Assert.Equal(100m, cableSession.GetProperty("exercises")[0].GetProperty("oneRepMaxKg").GetDecimal());
        Assert.Equal(HttpStatusCode.OK, (await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 25, reps = 8, completed = true, rpe = 8, rir = 2
        })).StatusCode);

        var effortMismatch = await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 25, reps = 8, completed = true, rpe = 8, rir = 1
        });
        Assert.Equal(HttpStatusCode.BadRequest, effortMismatch.StatusCode);

        var blockedSwitch = await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/exercises/{workoutExerciseId}/choice", new
        {
            exerciseId = machineId, clearLoggedSets = false
        });
        Assert.Equal(HttpStatusCode.Conflict, blockedSwitch.StatusCode);
        var switchAndClear = await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/exercises/{workoutExerciseId}/choice", new
        {
            exerciseId = machineId, clearLoggedSets = true
        });
        Assert.Equal(HttpStatusCode.OK, switchAndClear.StatusCode);
        var clearedSession = await switchAndClear.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(machineId, clearedSession.GetProperty("exercises")[0].GetProperty("exerciseId").GetString());
        Assert.Equal(120m, clearedSession.GetProperty("exercises")[0].GetProperty("oneRepMaxKg").GetDecimal());
        Assert.False(clearedSession.GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("completed").GetBoolean());

        var updateRoutine = await alice.PutAsJsonAsync($"/api/routines/{routineId}", new
        {
            name = "Upper A revised",
            exercises = new[]
            {
                new
                {
                    id = slotId, name = "Incline press", sets = 3, targetReps = 10,
                    options = new[]
                    {
                        new { name = "Cable incline press", exerciseId = cableId },
                        new { name = "Machine incline press", exerciseId = machineId }
                    }
                }
            }
        });
        Assert.True(updateRoutine.StatusCode == HttpStatusCode.OK, await updateRoutine.Content.ReadAsStringAsync());
        var updatedRoutine = await updateRoutine.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(slotId, updatedRoutine.GetProperty("exercises")[0].GetProperty("id").GetString());
        Assert.Equal(3, updatedRoutine.GetProperty("exercises")[0].GetProperty("sets").GetInt32());

        using var bob = factory.CreateClient();
        await RegisterAndSignIn(bob, "other@example.com");
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"/api/sessions/{sessionId}/exercises/{workoutExerciseId}/choice", new
        {
            exerciseId = cableId, clearLoggedSets = false
        })).StatusCode);
    }

    [Fact]
    public async Task Bodyweight_sets_snapshot_body_mass_and_report_partial_tonnage_when_missing()
    {
        using var factory = new LiftFactory();
        factory.Initialize();
        using var client = factory.CreateClient();
        await RegisterAndSignIn(client, "bodyweight-sets@example.com");

        var exerciseResponse = await client.PostAsJsonAsync("/api/exercises", new { name = "Pull-up", kind = "bodyweight", oneRepMaxKg = 100m });
        Assert.Equal(HttpStatusCode.Created, exerciseResponse.StatusCode);
        var exercise = await exerciseResponse.Content.ReadFromJsonAsync<JsonElement>();
        var exerciseId = exercise.GetProperty("id").GetString();

        var weightResponse = await client.PostAsJsonAsync("/api/bodyweight", new
        {
            weightKg = 78.4m, measuredOn = DateOnly.FromDateTime(DateTime.UtcNow)
        });
        Assert.Equal(HttpStatusCode.Created, weightResponse.StatusCode);
        var weightEntry = await weightResponse.Content.ReadFromJsonAsync<JsonElement>();
        var weightEntryId = weightEntry.GetProperty("id").GetString();

        var routineResponse = await client.PostAsJsonAsync("/api/routines", new
        {
            name = "Pull day",
            exercises = new[]
            {
                new { name = "Pull-up", exerciseId, sets = 2, targetReps = 8 }
            }
        });
        Assert.Equal(HttpStatusCode.Created, routineResponse.StatusCode);
        var routine = await routineResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionResponse = await client.PostAsJsonAsync("/api/sessions", new { routineId = routine.GetProperty("id").GetString() });
        Assert.Equal(HttpStatusCode.Created, sessionResponse.StatusCode);
        var session = await sessionResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetString();
        var sets = session.GetProperty("exercises")[0].GetProperty("sets");
        var firstSetId = sets[0].GetProperty("id").GetString();
        var secondSetId = sets[1].GetProperty("id").GetString();

        var firstSetResponse = await client.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{firstSetId}", new
        {
            weightKg = (decimal?)null, reps = 10, completed = true, rpe = 8, rir = 2
        });
        Assert.Equal(HttpStatusCode.OK, firstSetResponse.StatusCode);
        var firstSetSession = await firstSetResponse.Content.ReadFromJsonAsync<JsonElement>();
        var firstSet = firstSetSession.GetProperty("exercises")[0].GetProperty("sets")[0];
        Assert.Equal(78.4m, firstSet.GetProperty("bodyMassKg").GetDecimal());
        Assert.Equal(78.4m, firstSet.GetProperty("percentageOfOneRm").GetDecimal());
        Assert.Equal(112.8m, firstSet.GetProperty("estimatedOneRmKg").GetDecimal());
        Assert.Equal(8m, firstSet.GetProperty("rpe").GetDecimal());
        Assert.Equal(2m, firstSet.GetProperty("rir").GetDecimal());
        Assert.Equal(784m, firstSetSession.GetProperty("metrics").GetProperty("tonnageKg").GetDecimal());
        Assert.True(firstSetSession.GetProperty("metrics").GetProperty("tonnageComplete").GetBoolean());

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/bodyweight/{weightEntryId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{secondSetId}", new
        {
            weightKg = 5m, reps = 8, completed = true
        })).StatusCode);

        var active = await client.GetFromJsonAsync<JsonElement>($"/api/sessions/active");
        var metrics = active.GetProperty("metrics");
        Assert.Equal(18, metrics.GetProperty("totalReps").GetInt32());
        Assert.Equal(784m, metrics.GetProperty("tonnageKg").GetDecimal());
        Assert.False(metrics.GetProperty("tonnageComplete").GetBoolean());
        Assert.Equal(78.4m, active.GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("bodyMassKg").GetDecimal());
    }

    [Fact]
    public async Task Session_experience_prescriptions_rating_and_duration_are_saved()
    {
        using var factory = new LiftFactory();
        factory.Initialize();
        using var client = factory.CreateClient();
        await RegisterAndSignIn(client, "session-experience@example.com");

        var routineResponse = await client.PostAsJsonAsync("/api/routines", new
        {
            name = "Technique day",
            exercises = new[]
            {
                new { name = "Tempo squat", sets = 1, targetReps = 5, section = "warmup", targetTempo = "3-1-1" },
                new { name = "Hip stretch", sets = 1, targetReps = 8, section = "cooldown", targetTempo = "" }
            }
        });
        Assert.Equal(HttpStatusCode.Created, routineResponse.StatusCode);
        var routine = await routineResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("warmup", routine.GetProperty("exercises")[0].GetProperty("section").GetString());
        Assert.Equal("3-1-1", routine.GetProperty("exercises")[0].GetProperty("targetTempo").GetString());

        var sessionResponse = await client.PostAsJsonAsync("/api/sessions", new { routineId = routine.GetProperty("id").GetString() });
        Assert.Equal(HttpStatusCode.Created, sessionResponse.StatusCode);
        var session = await sessionResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetString();
        var exercise = session.GetProperty("exercises")[0];
        Assert.Equal("warmup", exercise.GetProperty("section").GetString());
        Assert.Equal("3-1-1", exercise.GetProperty("targetTempo").GetString());

        var setId = exercise.GetProperty("sets")[0].GetProperty("id").GetString();
        var invalidTempo = await client.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 20, reps = 5, completed = true, actualTempo = "slow"
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidTempo.StatusCode);
        var logged = await client.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 20, reps = 5, completed = true, actualTempo = "2-1-2"
        });
        Assert.Equal(HttpStatusCode.OK, logged.StatusCode);
        Assert.Equal("2-1-2", (await logged.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("actualTempo").GetString());

        var invalidRating = await client.PutAsJsonAsync($"/api/sessions/{sessionId}/rating", new { rating = 6, note = "Too much" });
        Assert.Equal(HttpStatusCode.BadRequest, invalidRating.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/sessions/{sessionId}/rating", new
        {
            rating = 5, note = "Strong session"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/sessions/{sessionId}/finish", null)).StatusCode);

        var history = await client.GetFromJsonAsync<JsonElement>("/api/sessions/history");
        Assert.Equal(5, history[0].GetProperty("rating").GetInt32());
        Assert.Equal("Strong session", history[0].GetProperty("ratingNote").GetString());
        Assert.True(history[0].GetProperty("durationSeconds").GetInt64() >= 0);
        Assert.Equal("2-1-2", history[0].GetProperty("exercises")[0].GetProperty("sets")[0].GetProperty("actualTempo").GetString());
    }

    [Fact]
    public async Task Strength_sets_show_entered_max_percent_and_rpe_chart_estimate()
    {
        using var factory = new LiftFactory();
        factory.Initialize();
        using var client = factory.CreateClient();
        await RegisterAndSignIn(client, "one-rep-max@example.com");

        var invalidExercise = await client.PostAsJsonAsync("/api/exercises", new
        {
            name = "Invalid max", kind = "strength", oneRepMaxKg = 0
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidExercise.StatusCode);

        var exerciseResponse = await client.PostAsJsonAsync("/api/exercises", new
        {
            name = "Bench press", kind = "strength", oneRepMaxKg = 100m
        });
        Assert.Equal(HttpStatusCode.Created, exerciseResponse.StatusCode);
        var exercise = await exerciseResponse.Content.ReadFromJsonAsync<JsonElement>();
        var exerciseId = exercise.GetProperty("id").GetString();

        var routineResponse = await client.PostAsJsonAsync("/api/routines", new
        {
            name = "Bench day",
            exercises = new[]
            {
                new { name = "Bench press", exerciseId, sets = 1, targetReps = 5 }
            }
        });
        Assert.Equal(HttpStatusCode.Created, routineResponse.StatusCode);
        var routine = await routineResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionResponse = await client.PostAsJsonAsync("/api/sessions", new { routineId = routine.GetProperty("id").GetString() });
        Assert.Equal(HttpStatusCode.Created, sessionResponse.StatusCode);
        var session = await sessionResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetString();
        var workoutExercise = session.GetProperty("exercises")[0];
        Assert.Equal(100m, workoutExercise.GetProperty("oneRepMaxKg").GetDecimal());

        var update = await client.PutAsJsonAsync($"/api/exercises/{exerciseId}", new
        {
            name = "Bench press", kind = "strength", oneRepMaxKg = 120m
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);

        var setId = workoutExercise.GetProperty("sets")[0].GetProperty("id").GetString();
        var log = await client.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 80m, reps = 5, completed = true, rpe = 8, rir = 2
        });
        Assert.Equal(HttpStatusCode.OK, log.StatusCode);
        var logged = await log.Content.ReadFromJsonAsync<JsonElement>();
        var selected = logged.GetProperty("exercises")[0];
        var set = selected.GetProperty("sets")[0];
        Assert.Equal(100m, selected.GetProperty("oneRepMaxKg").GetDecimal());
        Assert.Equal(80m, set.GetProperty("percentageOfOneRm").GetDecimal());
        Assert.Equal(98.6m, set.GetProperty("estimatedOneRmKg").GetDecimal());
    }

    [Fact]
    public async Task Cardio_targets_are_prescribed_and_results_are_entered_manually()
    {
        using var factory = new LiftFactory();
        factory.Initialize();
        using var client = factory.CreateClient();
        await RegisterAndSignIn(client, "cardio@example.com");

        var exerciseResponse = await client.PostAsJsonAsync("/api/exercises", new { name = "Stationary bike", kind = "cardio" });
        Assert.Equal(HttpStatusCode.Created, exerciseResponse.StatusCode);
        var exercise = await exerciseResponse.Content.ReadFromJsonAsync<JsonElement>();
        var exerciseId = exercise.GetProperty("id").GetString();

        var invalidRange = await client.PostAsJsonAsync("/api/routines", new
        {
            name = "Bad cardio",
            exercises = new[]
            {
                new { name = "Bike", exerciseId, sets = 1, targetReps = 1, targetHeartRateMin = 160, targetHeartRateMax = 150 }
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidRange.StatusCode);

        var routineResponse = await client.PostAsJsonAsync("/api/routines", new
        {
            name = "Bike intervals",
            exercises = new[]
            {
                new
                {
                    name = "Bike", exerciseId, sets = 1, targetReps = 1, targetHeartRateMin = 120, targetHeartRateMax = 150,
                    targetResistanceLevel = 6.5m, targetRpm = 80m, targetDurationSeconds = 600
                }
            }
        });
        Assert.Equal(HttpStatusCode.Created, routineResponse.StatusCode);
        var routine = await routineResponse.Content.ReadFromJsonAsync<JsonElement>();
        var savedSlot = routine.GetProperty("exercises")[0];
        Assert.Equal(120, savedSlot.GetProperty("targetHeartRateMin").GetInt32());
        Assert.Equal(150, savedSlot.GetProperty("targetHeartRateMax").GetInt32());
        Assert.Equal(6.5m, savedSlot.GetProperty("targetResistanceLevel").GetDecimal());
        Assert.Equal(80m, savedSlot.GetProperty("targetRpm").GetDecimal());

        var sessionResponse = await client.PostAsJsonAsync("/api/sessions", new { routineId = routine.GetProperty("id").GetString() });
        Assert.Equal(HttpStatusCode.Created, sessionResponse.StatusCode);
        var session = await sessionResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetString();
        var sessionExercise = session.GetProperty("exercises")[0];
        Assert.Equal("cardio", sessionExercise.GetProperty("kind").GetString());
        Assert.Equal(120, sessionExercise.GetProperty("targetHeartRateMin").GetInt32());
        var setId = sessionExercise.GetProperty("sets")[0].GetProperty("id").GetString();
        Assert.Equal(600, sessionExercise.GetProperty("sets")[0].GetProperty("targetDurationSeconds").GetInt32());

        var missingDuration = await client.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = (decimal?)null, reps = (int?)null, completed = true
        });
        Assert.Equal(HttpStatusCode.BadRequest, missingDuration.StatusCode);
        var invalidHeartRate = await client.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = (decimal?)null, reps = (int?)null, completed = true, durationSeconds = 600, heartRateBpm = 241
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidHeartRate.StatusCode);

        var log = await client.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = (decimal?)null, reps = (int?)null, completed = true, durationSeconds = 600,
            heartRateBpm = 145, resistanceLevel = 6.5m, rpm = 82m
        });
        Assert.Equal(HttpStatusCode.OK, log.StatusCode);
        var saved = await log.Content.ReadFromJsonAsync<JsonElement>();
        var loggedSet = saved.GetProperty("exercises")[0].GetProperty("sets")[0];
        Assert.Equal(600, loggedSet.GetProperty("durationSeconds").GetInt32());
        Assert.Equal(145, loggedSet.GetProperty("heartRateBpm").GetInt32());
        Assert.Equal(6.5m, loggedSet.GetProperty("resistanceLevel").GetDecimal());
        Assert.Equal(82m, loggedSet.GetProperty("rpm").GetDecimal());
        Assert.Equal(JsonValueKind.Null, saved.GetProperty("metrics").GetProperty("tonnageKg").ValueKind);
    }

    private static async Task RegisterAndSignIn(HttpClient client, string email)
    {
        var password = "StrongPass1!";
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/register", new { email, password })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/login?useCookies=true", new { email, password })).StatusCode);
    }

    private sealed class LiftFactory : WebApplicationFactory<Program>
    {
        private readonly SqliteConnection _connection = new("Data Source=:memory:");

        public LiftFactory() => _connection.Open();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<DbContextOptions<LiftDbContext>>();
                services.RemoveAll<LiftDbContext>();
                services.RemoveAll<IDatabaseProvider>();
                services.RemoveAll<IDbContextOptionsConfiguration<LiftDbContext>>();
                services.AddDbContext<LiftDbContext>(options => options.UseSqlite(_connection));
            });
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing) _connection.Dispose();
        }

        public void Initialize()
        {
            using var scope = Services.CreateScope();
            scope.ServiceProvider.GetRequiredService<LiftDbContext>().Database.EnsureCreated();
        }
    }
}
