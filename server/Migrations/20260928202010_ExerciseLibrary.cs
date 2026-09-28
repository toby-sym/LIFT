using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lift.Api.Migrations
{
    /// <inheritdoc />
    public partial class ExerciseLibrary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ExerciseDefinitionId",
                table: "WorkoutExercises",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ExerciseDefinitionId",
                table: "RoutineExercises",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ExerciseLibrary",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExerciseLibrary", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExerciseLibrary_AspNetUsers_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql("""
                INSERT INTO "ExerciseLibrary" ("Id", "OwnerId", "Name", "NormalizedName", "Kind", "CreatedAt")
                SELECT gen_random_uuid(), source."OwnerId", MIN(BTRIM(source."Name")),
                       UPPER(BTRIM(source."Name")), 'strength', NOW()
                FROM (
                    SELECT r."OwnerId", re."Name"
                    FROM "RoutineExercises" re
                    INNER JOIN "Routines" r ON r."Id" = re."RoutineId"
                    UNION ALL
                    SELECT s."OwnerId", we."Name"
                    FROM "WorkoutExercises" we
                    INNER JOIN "WorkoutSessions" s ON s."Id" = we."SessionId"
                ) source
                GROUP BY source."OwnerId", UPPER(BTRIM(source."Name"));

                UPDATE "RoutineExercises" re
                SET "ExerciseDefinitionId" = e."Id"
                FROM "Routines" r, "ExerciseLibrary" e
                WHERE r."Id" = re."RoutineId"
                  AND e."OwnerId" = r."OwnerId"
                  AND e."NormalizedName" = UPPER(BTRIM(re."Name"));

                UPDATE "WorkoutExercises" we
                SET "ExerciseDefinitionId" = e."Id"
                FROM "WorkoutSessions" s, "ExerciseLibrary" e
                WHERE s."Id" = we."SessionId"
                  AND e."OwnerId" = s."OwnerId"
                  AND e."NormalizedName" = UPPER(BTRIM(we."Name"));
                """);

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutExercises_ExerciseDefinitionId",
                table: "WorkoutExercises",
                column: "ExerciseDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_RoutineExercises_ExerciseDefinitionId",
                table: "RoutineExercises",
                column: "ExerciseDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_ExerciseLibrary_OwnerId_NormalizedName",
                table: "ExerciseLibrary",
                columns: new[] { "OwnerId", "NormalizedName" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_RoutineExercises_ExerciseLibrary_ExerciseDefinitionId",
                table: "RoutineExercises",
                column: "ExerciseDefinitionId",
                principalTable: "ExerciseLibrary",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkoutExercises_ExerciseLibrary_ExerciseDefinitionId",
                table: "WorkoutExercises",
                column: "ExerciseDefinitionId",
                principalTable: "ExerciseLibrary",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RoutineExercises_ExerciseLibrary_ExerciseDefinitionId",
                table: "RoutineExercises");

            migrationBuilder.DropForeignKey(
                name: "FK_WorkoutExercises_ExerciseLibrary_ExerciseDefinitionId",
                table: "WorkoutExercises");

            migrationBuilder.DropTable(
                name: "ExerciseLibrary");

            migrationBuilder.DropIndex(
                name: "IX_WorkoutExercises_ExerciseDefinitionId",
                table: "WorkoutExercises");

            migrationBuilder.DropIndex(
                name: "IX_RoutineExercises_ExerciseDefinitionId",
                table: "RoutineExercises");

            migrationBuilder.DropColumn(
                name: "ExerciseDefinitionId",
                table: "WorkoutExercises");

            migrationBuilder.DropColumn(
                name: "ExerciseDefinitionId",
                table: "RoutineExercises");
        }
    }
}
