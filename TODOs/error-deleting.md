"Delete" buttons on /events/[id] give this error:

query: 'delete from "users" where "users"."id" = $1',
[1] params: [Array],
[1] [cause]: Error [NeonDbError]: update or delete on table "users" violates foreign key constraint "solution_parties_driver_user_id_users_id_fk" on table "solution_parties"
[1] at async DELETE (src/app/api/testing-events/[id]/riders/route.ts:234:5)
[1] 232 | );
[1] 233 |
[1] > 234 | await db.delete(users).where(eq(users.id, userId));
[1] | ^
[1] 235 |
[1] 236 | return NextResponse.json({ success: true });
[1] 237 | } {
[1] severity: 'ERROR',
[1] code: '23503',
[1] detail: 'Key (id)=(test_2bf219c3-e541-46e4-b808-16283fbd9762) is still referenced from table "solution_parties".',
[1] hint: undefined,
[1] position: undefined,
[1] internalPosition: undefined,
[1] internalQuery: undefined,
[1] where: undefined,
[1] schema: 'public',
[1] table: 'solution_parties',
[1] column: undefined,
[1] dataType: undefined,
[1] constraint: 'solution_parties_driver_user_id_users_id_fk',
[1] file: 'ri_triggers.c',
[1] line: '2612',
[1] routine: 'ri_ReportViolation',
[1] sourceError: undefined
[1] }
[1] }
