using Lift.Api;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Lift")
    ?? throw new InvalidOperationException("Set ConnectionStrings:Lift before starting the API.");

builder.Services.AddDbContext<LiftDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddAuthorization();
builder.Services.AddIdentityApiEndpoints<IdentityUser>(options =>
    {
        options.User.RequireUniqueEmail = true;
        options.Password.RequiredLength = 8;
    })
    .AddEntityFrameworkStores<LiftDbContext>();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
});

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<LiftDbContext>();
    await dbContext.Database.MigrateAsync();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapIdentityApi<IdentityUser>().WithTags("Accounts");
app.MapLiftEndpoints();

if (!app.Environment.IsDevelopment())
{
    app.MapFallbackToFile("index.html");
}

app.Run();

public partial class Program;
