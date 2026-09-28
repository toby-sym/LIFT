using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Lift.Api;

public sealed class LiftDbContext(DbContextOptions<LiftDbContext> options) : IdentityDbContext<IdentityUser>(options)
{
    public DbSet<ExerciseDefinition> ExerciseLibrary => Set<ExerciseDefinition>();
    public DbSet<BodyweightEntry> BodyweightEntries => Set<BodyweightEntry>();
    public DbSet<Routine> Routines => Set<Routine>();
    public DbSet<RoutineExercise> RoutineExercises => Set<RoutineExercise>();
    public DbSet<RoutineExerciseOption> RoutineExerciseOptions => Set<RoutineExerciseOption>();
    public DbSet<WorkoutSession> WorkoutSessions => Set<WorkoutSession>();
    public DbSet<WorkoutExercise> WorkoutExercises => Set<WorkoutExercise>();
    public DbSet<WorkoutExerciseOption> WorkoutExerciseOptions => Set<WorkoutExerciseOption>();
    public DbSet<WorkoutSet> WorkoutSets => Set<WorkoutSet>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ExerciseDefinition>(entity =>
        {
            entity.HasIndex(x => new { x.OwnerId, x.NormalizedName }).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.NormalizedName).HasMaxLength(100);
            entity.Property(x => x.Kind).HasMaxLength(20);
            entity.Property(x => x.OneRepMaxKg).HasPrecision(7, 2);
            entity.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<BodyweightEntry>(entity =>
        {
            entity.HasIndex(x => new { x.OwnerId, x.MeasuredOn });
            entity.Property(x => x.WeightKg).HasPrecision(7, 2);
            entity.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Routine>(entity =>
        {
            entity.HasIndex(x => new { x.OwnerId, x.CreatedAt });
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Exercises).WithOne().HasForeignKey(x => x.RoutineId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<RoutineExercise>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.Section).HasMaxLength(20);
            entity.Property(x => x.TargetTempo).HasMaxLength(20);
            entity.HasIndex(x => new { x.RoutineId, x.Order });
            entity.HasOne(x => x.ExerciseDefinition).WithMany().HasForeignKey(x => x.ExerciseDefinitionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasMany(x => x.Options).WithOne().HasForeignKey(x => x.RoutineExerciseId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<RoutineExerciseOption>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.HasIndex(x => new { x.RoutineExerciseId, x.Order }).IsUnique();
            entity.HasOne(x => x.ExerciseDefinition).WithMany().HasForeignKey(x => x.ExerciseDefinitionId).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<WorkoutSession>(entity =>
        {
            entity.HasIndex(x => new { x.OwnerId, x.StartedAt });
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.Notes).HasMaxLength(2000);
            entity.Property(x => x.RatingNote).HasMaxLength(500);
            entity.HasOne<IdentityUser>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Exercises).WithOne().HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<WorkoutExercise>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.SlotName).HasMaxLength(100);
            entity.Property(x => x.Kind).HasMaxLength(20);
            entity.Property(x => x.Section).HasMaxLength(20);
            entity.Property(x => x.TargetTempo).HasMaxLength(20);
            entity.Property(x => x.OneRepMaxKg).HasPrecision(7, 2);
            entity.HasIndex(x => new { x.SessionId, x.Order });
            entity.HasOne<RoutineExercise>().WithMany().HasForeignKey(x => x.RoutineSlotId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.ExerciseDefinition).WithMany().HasForeignKey(x => x.ExerciseDefinitionId).OnDelete(DeleteBehavior.SetNull);
            entity.HasMany(x => x.Options).WithOne().HasForeignKey(x => x.WorkoutExerciseId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Sets).WithOne().HasForeignKey(x => x.ExerciseId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<WorkoutExerciseOption>(entity =>
        {
            entity.Property(x => x.Name).HasMaxLength(100);
            entity.Property(x => x.Kind).HasMaxLength(20);
            entity.Property(x => x.OneRepMaxKg).HasPrecision(7, 2);
            entity.HasIndex(x => new { x.WorkoutExerciseId, x.Order }).IsUnique();
            entity.HasOne(x => x.ExerciseDefinition).WithMany().HasForeignKey(x => x.ExerciseDefinitionId).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<WorkoutSet>(entity =>
        {
            entity.Property(x => x.WeightKg).HasPrecision(7, 2);
            entity.Property(x => x.BodyMassKg).HasPrecision(7, 2);
            entity.Property(x => x.Rpe).HasPrecision(3, 1);
            entity.Property(x => x.Rir).HasPrecision(3, 1);
            entity.Property(x => x.ActualTempo).HasMaxLength(20);
            entity.HasIndex(x => new { x.ExerciseId, x.Order });
        });
    }
}

public sealed class ExerciseDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string OwnerId { get; set; }
    public required string Name { get; set; }
    public required string NormalizedName { get; set; }
    public string Kind { get; set; } = "strength";
    public decimal? OneRepMaxKg { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class BodyweightEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string OwnerId { get; set; }
    public decimal WeightKg { get; set; }
    public DateOnly MeasuredOn { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class Routine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string OwnerId { get; set; }
    public required string Name { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<RoutineExercise> Exercises { get; set; } = [];
}

public sealed class RoutineExercise
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RoutineId { get; set; }
    public Guid? ExerciseDefinitionId { get; set; }
    public int Order { get; set; }
    public required string Name { get; set; }
    public int Sets { get; set; }
    public int TargetReps { get; set; }
    public string Section { get; set; } = "work";
    public string? TargetTempo { get; set; }
    public ExerciseDefinition? ExerciseDefinition { get; set; }
    public List<RoutineExerciseOption> Options { get; set; } = [];
}

public sealed class RoutineExerciseOption
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RoutineExerciseId { get; set; }
    public Guid? ExerciseDefinitionId { get; set; }
    public int Order { get; set; }
    public required string Name { get; set; }
    public ExerciseDefinition? ExerciseDefinition { get; set; }
}

public sealed class WorkoutSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string OwnerId { get; set; }
    public Guid? RoutineId { get; set; }
    public required string Name { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public string Notes { get; set; } = "";
    public int? Rating { get; set; }
    public string RatingNote { get; set; } = "";
    public List<WorkoutExercise> Exercises { get; set; } = [];
}

public sealed class WorkoutExercise
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SessionId { get; set; }
    public Guid? RoutineSlotId { get; set; }
    public Guid? ExerciseDefinitionId { get; set; }
    public int Order { get; set; }
    public string? SlotName { get; set; }
    public required string Name { get; set; }
    public string Kind { get; set; } = "strength";
    public decimal? OneRepMaxKg { get; set; }
    public string Section { get; set; } = "work";
    public string? TargetTempo { get; set; }
    public ExerciseDefinition? ExerciseDefinition { get; set; }
    public List<WorkoutExerciseOption> Options { get; set; } = [];
    public List<WorkoutSet> Sets { get; set; } = [];
}

public sealed class WorkoutExerciseOption
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkoutExerciseId { get; set; }
    public Guid? ExerciseDefinitionId { get; set; }
    public int Order { get; set; }
    public required string Name { get; set; }
    public string Kind { get; set; } = "strength";
    public decimal? OneRepMaxKg { get; set; }
    public ExerciseDefinition? ExerciseDefinition { get; set; }
}

public sealed class WorkoutSet
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ExerciseId { get; set; }
    public int Order { get; set; }
    public int TargetReps { get; set; }
    public decimal? WeightKg { get; set; }
    public decimal? BodyMassKg { get; set; }
    public int? Reps { get; set; }
    public decimal? Rpe { get; set; }
    public decimal? Rir { get; set; }
    public string? ActualTempo { get; set; }
    public bool Completed { get; set; }
}
