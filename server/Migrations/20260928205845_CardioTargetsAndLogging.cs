using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lift.Api.Migrations
{
    /// <inheritdoc />
    public partial class CardioTargetsAndLogging : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DurationSeconds",
                table: "WorkoutSets",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HeartRateBpm",
                table: "WorkoutSets",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ResistanceLevel",
                table: "WorkoutSets",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Rpm",
                table: "WorkoutSets",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetDurationSeconds",
                table: "WorkoutSets",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetHeartRateMax",
                table: "WorkoutExercises",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetHeartRateMin",
                table: "WorkoutExercises",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TargetResistanceLevel",
                table: "WorkoutExercises",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TargetRpm",
                table: "WorkoutExercises",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetDurationSeconds",
                table: "RoutineExercises",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetHeartRateMax",
                table: "RoutineExercises",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetHeartRateMin",
                table: "RoutineExercises",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TargetResistanceLevel",
                table: "RoutineExercises",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TargetRpm",
                table: "RoutineExercises",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DurationSeconds",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "HeartRateBpm",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "ResistanceLevel",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "Rpm",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "TargetDurationSeconds",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "TargetHeartRateMax",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "TargetHeartRateMin",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "TargetResistanceLevel",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "TargetRpm",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "TargetDurationSeconds",
                table: "RoutineExercises");

            migrationBuilder.DropColumn(
                name: "TargetHeartRateMax",
                table: "RoutineExercises");

            migrationBuilder.DropColumn(
                name: "TargetHeartRateMin",
                table: "RoutineExercises");

            migrationBuilder.DropColumn(
                name: "TargetResistanceLevel",
                table: "RoutineExercises");

            migrationBuilder.DropColumn(
                name: "TargetRpm",
                table: "RoutineExercises");
        }
    }
}
