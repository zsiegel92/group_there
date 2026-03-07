import { after, NextRequest, NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/db";
import {
  blasts,
  blastTypeValues,
  events,
  eventsToUsers,
  groupsToUsers,
} from "@/db/schema";
import { getUser } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";

type Params = {
  params: Promise<{ id: string }>;
};

const blastRequestSchema = z.object({
  type: z.enum(blastTypeValues),
});

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

  const eventDate = event.time.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const eventTime = event.time.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const locationName = event.location?.name ?? "TBD";

  let recipients: { email: string }[] = [];

  if (type === "event_scheduled") {
    // Get all group members who have NOT joined this event
    const attendees = await db.query.eventsToUsers.findMany({
      where: eq(eventsToUsers.eventId, eventId),
      columns: { userId: true },
    });

    const attendeeUserIds = attendees.map((a) => a.userId);

    const membersQuery = attendeeUserIds.length > 0
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
    recipients = nonAttendingMembers.map((m) => ({ email: m.user.email }));
  } else {
    // event_confirmed: all attendees
    const attendees = await db.query.eventsToUsers.findMany({
      where: eq(eventsToUsers.eventId, eventId),
      with: { user: true },
    });
    recipients = attendees.map((a) => ({ email: a.user.email }));
  }

  const recipientCount = recipients.length;

  // Insert blast record
  const blastId = `blast_${crypto.randomUUID()}`;
  await db.insert(blasts).values({
    id: blastId,
    eventId,
    type,
    sentByUserId: user.id,
    recipientCount,
  });

  // Send emails in the background
  after(async () => {
    for (const recipient of recipients) {
      if (type === "event_scheduled") {
        await sendEmail({
          to: recipient.email,
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
      } else {
        await sendEmail({
          to: recipient.email,
          subject: `Your carpool for ${event.name} is confirmed`,
          text: `Your carpool for "${event.name}" with ${event.group.name} is confirmed!\n\nWhen: ${eventDate} at ${eventTime}\nWhere: ${locationName}\n\nView your trip details: ${eventUrl}`,
          html: `
            <h2>Carpool Confirmed!</h2>
            <p>Your carpool for <strong>${event.name}</strong> with ${event.group.name} is confirmed!</p>
            <p><strong>When:</strong> ${eventDate} at ${eventTime}</p>
            <p><strong>Where:</strong> ${locationName}</p>
            <p><a href="${eventUrl}">View your trip details on GROUPTHERE</a></p>
          `,
        });
      }
    }
  });

  return NextResponse.json({ success: true, recipientCount });
}
