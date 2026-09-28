using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lift.Api.Migrations
{
    /// <inheritdoc />
    public partial class ExerciseGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GroupId",
                table: "WorkoutExercises",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GroupId",
                table: "RoutineExercises",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "RoutineExercises");
        }
    }
}
