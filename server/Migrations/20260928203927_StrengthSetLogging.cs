using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lift.Api.Migrations
{
    /// <inheritdoc />
    public partial class StrengthSetLogging : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BodyMassKg",
                table: "WorkoutSets",
                type: "numeric(7,2)",
                precision: 7,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Rir",
                table: "WorkoutSets",
                type: "numeric(3,1)",
                precision: 3,
                scale: 1,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Rpe",
                table: "WorkoutSets",
                type: "numeric(3,1)",
                precision: 3,
                scale: 1,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "WorkoutExercises",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "strength");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BodyMassKg",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "Rir",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "Rpe",
                table: "WorkoutSets");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "WorkoutExercises");
        }
    }
}
