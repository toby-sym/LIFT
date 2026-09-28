using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lift.Api.Migrations
{
    /// <inheritdoc />
    public partial class RoutineExerciseOptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RoutineSlotId",
                table: "WorkoutExercises",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SlotName",
                table: "WorkoutExercises",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE "WorkoutExercises"
                SET "SlotName" = "Name";

                UPDATE "WorkoutExercises" we
                SET "RoutineSlotId" = re."Id"
                FROM "WorkoutSessions" ws, "RoutineExercises" re
                WHERE ws."Id" = we."SessionId"
                  AND ws."RoutineId" = re."RoutineId"
                  AND we."Order" = re."Order"
                  AND UPPER(BTRIM(we."Name")) = UPPER(BTRIM(re."Name"));
                """);

            migrationBuilder.CreateTable(
                name: "RoutineExerciseOptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoutineExerciseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExerciseDefinitionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoutineExerciseOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RoutineExerciseOptions_ExerciseLibrary_ExerciseDefinitionId",
                        column: x => x.ExerciseDefinitionId,
                        principalTable: "ExerciseLibrary",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_RoutineExerciseOptions_RoutineExercises_RoutineExerciseId",
                        column: x => x.RoutineExerciseId,
                        principalTable: "RoutineExercises",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkoutExerciseOptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkoutExerciseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExerciseDefinitionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkoutExerciseOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkoutExerciseOptions_ExerciseLibrary_ExerciseDefinitionId",
                        column: x => x.ExerciseDefinitionId,
                        principalTable: "ExerciseLibrary",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_WorkoutExerciseOptions_WorkoutExercises_WorkoutExerciseId",
                        column: x => x.WorkoutExerciseId,
                        principalTable: "WorkoutExercises",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutExercises_RoutineSlotId",
                table: "WorkoutExercises",
                column: "RoutineSlotId");

            migrationBuilder.CreateIndex(
                name: "IX_RoutineExerciseOptions_ExerciseDefinitionId",
                table: "RoutineExerciseOptions",
                column: "ExerciseDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_RoutineExerciseOptions_RoutineExerciseId_Order",
                table: "RoutineExerciseOptions",
                columns: new[] { "RoutineExerciseId", "Order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutExerciseOptions_ExerciseDefinitionId",
                table: "WorkoutExerciseOptions",
                column: "ExerciseDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutExerciseOptions_WorkoutExerciseId_Order",
                table: "WorkoutExerciseOptions",
                columns: new[] { "WorkoutExerciseId", "Order" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkoutExercises_RoutineExercises_RoutineSlotId",
                table: "WorkoutExercises",
                column: "RoutineSlotId",
                principalTable: "RoutineExercises",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_WorkoutExercises_RoutineExercises_RoutineSlotId",
                table: "WorkoutExercises");

            migrationBuilder.DropTable(
                name: "RoutineExerciseOptions");

            migrationBuilder.DropTable(
                name: "WorkoutExerciseOptions");

            migrationBuilder.DropIndex(
                name: "IX_WorkoutExercises_RoutineSlotId",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "RoutineSlotId",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "SlotName",
                table: "WorkoutExercises");
        }
    }
}
