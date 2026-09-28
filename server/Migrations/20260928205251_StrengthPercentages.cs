using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lift.Api.Migrations
{
    /// <inheritdoc />
    public partial class StrengthPercentages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "OneRepMaxKg",
                table: "WorkoutExercises",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "OneRepMaxKg",
                table: "WorkoutExerciseOptions",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "OneRepMaxKg",
                table: "ExerciseLibrary",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OneRepMaxKg",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "OneRepMaxKg",
                table: "WorkoutExerciseOptions");

            migrationBuilder.DropColumn(
                name: "OneRepMaxKg",
                table: "ExerciseLibrary");
        }
    }
}
