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
