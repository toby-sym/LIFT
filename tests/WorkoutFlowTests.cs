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

        var cableResponse = await alice.PostAsJsonAsync("/api/exercises", new { name = "Cable incline press", kind = "strength" });
        var machineResponse = await alice.PostAsJsonAsync("/api/exercises", new { name = "Machine incline press", kind = "strength" });
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
        Assert.Equal(cableId, (await chooseCable.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("exercises")[0].GetProperty("exerciseId").GetString());
        Assert.Equal(HttpStatusCode.OK, (await alice.PutAsJsonAsync($"/api/sessions/{sessionId}/sets/{setId}", new
        {
            weightKg = 25, reps = 8, completed = true
        })).StatusCode);

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
