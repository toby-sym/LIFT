using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lift.Api.Migrations
{
    /// <inheritdoc />
    public partial class SessionExperience : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActualTempo",
                table: "WorkoutSets",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Rating",
                table: "WorkoutSessions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RatingNote",
                table: "WorkoutSessions",
                type: "character varying(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Section",
                table: "WorkoutExercises",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "work");

            migrationBuilder.AddColumn<string>(
                name: "TargetTempo",
                table: "WorkoutExercises",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Section",
                table: "RoutineExercises",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "work");

            migrationBuilder.AddColumn<string>(
                name: "TargetTempo",
                table: "RoutineExercises",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActualTempo",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "Rating",
                table: "WorkoutSessions");

            migrationBuilder.DropColumn(
                name: "RatingNote",
                table: "WorkoutSessions");

            migrationBuilder.DropColumn(
                name: "Section",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "TargetTempo",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "Section",
                table: "RoutineExercises");

            migrationBuilder.DropColumn(
                name: "TargetTempo",
                table: "RoutineExercises");
        }
    }
}
