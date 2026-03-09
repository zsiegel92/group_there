import { after, NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  blasts,
  blastTypeValues,
  events,
  groupsToUsers,
  solutions,
} from "@/db/schema";
import { getUser } from "@/lib/auth";
import { computePartyEstimates } from "@/lib/itinerary";
import { sendEmail } from "@/lib/resend";

type Params = {
  params: Promise<{ id: string }>;
};

const blastRequestSchema = z.object({
  type: z.enum(blastTypeValues),
});

function formatTime(date: Date) {
  return format(date, "h:mm a");
}

// POST /api/events/[id]/blast - Send email blast (admin only)
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  const user = await getUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.id;

  const body = await request.json();
  const result = blastRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid input", details: result.error.issues },
      { status: 400 }
    );
  }

  const { type } = result.data;

  // Get event with location
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: {
      group: true,
      location: true,
      eventsToUsers: {
        with: {
          user: true,
          originLocation: true,
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Check if user is an admin of the event's group
  const membership = await db.query.groupsToUsers.findFirst({
    where: and(
      eq(groupsToUsers.groupId, event.groupId),
      eq(groupsToUsers.userId, user.id)
    ),
  });

  if (!membership || !membership.isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Block blasts for testing events
  if (event.group.type === "testing") {
    return NextResponse.json(
      { error: "Cannot send blast emails for testing events" },
      { status: 400 }
    );
  }

  // Validate event state matches blast type
  if (type === "event_scheduled" && !event.scheduled) {
    return NextResponse.json(
      { error: "Event must be scheduled to send this notification" },
      { status: 400 }
    );
  }

  if (type === "event_confirmed" && !event.locked) {
    return NextResponse.json(
      { error: "Event must be locked to send confirmation emails" },
      { status: 400 }
    );
  }

  let baseUrl =
    process.env.VERCEL_URL || process.env.PRODUCTION_URL || "localhost:3000";
  baseUrl = baseUrl.replace(/^https?:\/\//, "");
  const protocol = baseUrl.includes("localhost") ? "http" : "https";
  const eventUrl = `${protocol}://${baseUrl}/events/${eventId}`;

  const eventDate = format(event.time, "EEEE, MMMM d, yyyy");
  const eventTime = formatTime(event.time);
  const locationName = event.location?.name ?? "TBD";
  const locationAddress = event.location?.addressString ?? "";

  let recipientCount = 0;

  if (type === "event_scheduled") {
    // Get all group members who have NOT joined this event
    const attendeeUserIds = event.eventsToUsers.map((a) => a.userId);

    const membersQuery =
      attendeeUserIds.length > 0
        ? db.query.groupsToUsers.findMany({
            where: and(
              eq(groupsToUsers.groupId, event.groupId),
              notInArray(groupsToUsers.userId, attendeeUserIds)
            ),
            with: { user: true },
          })
        : db.query.groupsToUsers.findMany({
            where: eq(groupsToUsers.groupId, event.groupId),
            with: { user: true },
          });

    const nonAttendingMembers = await membersQuery;
    recipientCount = nonAttendingMembers.length;

    // Insert blast record
    const blastId = `blast_${crypto.randomUUID()}`;
    await db.insert(blasts).values({
      id: blastId,
      eventId,
      type,
      sentByUserId: user.id,
      recipientCount,
    });

    after(async () => {
      for (const member of nonAttendingMembers) {
        await sendEmail({
          to: member.user.email,
          subject: `You're invited to join ${event.name} on GROUPTHERE`,
          text: `You're invited to join "${event.name}" with ${event.group.name}.\n\nWhen: ${eventDate} at ${eventTime}\nWhere: ${locationName}\n\nJoin the event: ${eventUrl}`,
          html: `
            <h2>You're Invited!</h2>
            <p>You're invited to join <strong>${event.name}</strong> with ${event.group.name}.</p>
            <p><strong>When:</strong> ${eventDate} at ${eventTime}</p>
            <p><strong>Where:</strong> ${locationName}</p>
            <p><a href="${eventUrl}">Join the event on GROUPTHERE</a></p>
          `,
        });
      }
    });
  } else {
    // event_confirmed: send personalized itinerary to each attendee
    const sol = await db.query.solutions.findFirst({
      where: eq(solutions.eventId, eventId),
      with: {
        parties: {
          with: {
            driver: true,
            members: {
              with: { user: true },
            },
          },
        },
      },
    });

    if (!sol) {
      return NextResponse.json(
        { error: "No solution found for this event" },
        { status: 400 }
      );
    }

    // Build attendee lookup
    const attendeeLookup = new Map(
      event.eventsToUsers.map((att) => [
        att.userId,
        {
          email: att.user.email,
          name: att.user.name,
          originLocationId: att.originLocationId,
          originLocationName: att.originLocation?.name ?? null,
          originAddress: att.originLocation?.addressString ?? null,
          earliestLeaveTime: att.earliestLeaveTime,
        },
      ])
    );

    // Pre-compute estimated times for all parties
    const partyEstimates = await Promise.all(
      sol.parties.map(async (party) => {
        const sortedMembers = party.members.sort(
          (a, b) => a.pickupOrder - b.pickupOrder
        );
        const membersForEstimate = sortedMembers.map((m) => {
          const att = attendeeLookup.get(m.userId);
          return {
            userId: m.userId,
            originLocationId: att?.originLocationId ?? null,
            earliestLeaveTime: att?.earliestLeaveTime ?? null,
            pickupOrder: m.pickupOrder,
          };
        });

        const estimates = await computePartyEstimates(
          membersForEstimate,
          event.locationId,
          event.time
        );

        return { party, sortedMembers, estimates };
      })
    );

    // Build per-recipient emails
    type RecipientEmail = {
      email: string;
      subject: string;
      text: string;
      html: string;
    };
    const emails: RecipientEmail[] = [];

    for (const { party: _party, sortedMembers, estimates } of partyEstimates) {
      for (const member of sortedMembers) {
        const att = attendeeLookup.get(member.userId);
        if (!att) continue;

        const isDriver = member.pickupOrder === 0;
        const role = isDriver ? "the Driver" : "a Passenger";

        // Build itinerary steps
        const steps: { label: string; detail: string; time: string | null }[] =
          [];

        for (const m of sortedMembers) {
          const mAtt = attendeeLookup.get(m.userId);
          const pickup = estimates.estimatedPickups.get(m.userId);
          const timeStr = pickup ? formatTime(pickup) : null;

          if (m.pickupOrder === 0) {
            steps.push({
              label: `Depart: ${mAtt?.name ?? "Driver"}`,
              detail: mAtt?.originAddress ?? mAtt?.originLocationName ?? "",
              time: timeStr,
            });
          } else {
            steps.push({
              label: `Pick up: ${mAtt?.name ?? "Passenger"} (${mAtt?.email ?? ""})`,
              detail: mAtt?.originAddress ?? mAtt?.originLocationName ?? "",
              time: timeStr,
            });
          }
        }

        // Final destination
        const arrivalTime = estimates.estimatedEventArrival
          ? formatTime(estimates.estimatedEventArrival)
          : null;
        steps.push({
          label: `Arrive: ${locationName}`,
          detail: locationAddress,
          time: arrivalTime,
        });

        // Build text version
        const textSteps = steps
          .map(
            (s) =>
              `${s.time ? `~${s.time}` : ""}  ${s.label}${s.detail ? ` - ${s.detail}` : ""}`
          )
          .join("\n");

        const text = [
          `Your carpool for "${event.name}" is confirmed!`,
          `You are ${role}.`,
          "",
          `Event: ${event.name}`,
          `When: ${eventDate} at ${eventTime}`,
          `Where: ${locationName}${locationAddress ? ` (${locationAddress})` : ""}`,
          "",
          "Your Itinerary:",
          textSteps,
          "",
          `View your trip details: ${eventUrl}`,
        ].join("\n");

        // Build HTML version
        const htmlSteps = steps
          .map(
            (s) =>
              `<tr>
                <td style="padding:4px 12px 4px 0;white-space:nowrap;color:#666;">${s.time ? `~${s.time}` : ""}</td>
                <td style="padding:4px 0;"><strong>${s.label}</strong>${s.detail ? `<br><span style="color:#666;font-size:0.9em;">${s.detail}</span>` : ""}</td>
              </tr>`
          )
          .join("");

        const html = `
          <h2>Carpool Confirmed!</h2>
          <p>Your carpool for <strong>${event.name}</strong> with ${event.group.name} is confirmed! You are <strong>${role}</strong>.</p>
          <p><strong>When:</strong> ${eventDate} at ${eventTime}</p>
          <p><strong>Where:</strong> ${locationName}${locationAddress ? ` (${locationAddress})` : ""}</p>
          <h3>Your Itinerary</h3>
          <table style="border-collapse:collapse;">${htmlSteps}</table>
          <p style="margin-top:16px;"><a href="${eventUrl}">View your trip details on GROUPTHERE</a></p>
        `;

        emails.push({
          email: att.email,
          subject: `Your carpool for ${event.name} is confirmed`,
          text,
          html,
        });
      }
    }

    recipientCount = emails.length;

    // Insert blast record
    const blastId = `blast_${crypto.randomUUID()}`;
    await db.insert(blasts).values({
      id: blastId,
      eventId,
      type,
      sentByUserId: user.id,
      recipientCount,
    });

    after(async () => {
      for (const email of emails) {
        await sendEmail({
          to: email.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }
    });
  }

  return NextResponse.json({ success: true, recipientCount });
}
