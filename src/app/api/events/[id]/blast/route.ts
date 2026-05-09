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
  type EventKind,
} from "@/db/schema";
import { getUser } from "@/lib/auth";
import {
  EVENT_KIND_LABELS,
  EVENT_LOCATION_EMAIL_LABELS,
  EVENT_LOCATION_EMAIL_SUMMARY_LABELS,
  NO_LOCATION_SET_COPY,
  PARTICIPANT_CHOSEN_DESTINATIONS_COPY,
  RECURRING_EVENT_TYPE_SUFFIX,
} from "@/lib/feature-brand-copy";
import { buildEstimateMembers, computePartyEstimates } from "@/lib/itinerary";
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

function formatNameAndAddress(name: string | null, address: string | null) {
  const trimmedName = name?.trim() || null;
  const trimmedAddress = address?.trim() || null;

  if (trimmedName && trimmedAddress && trimmedName !== trimmedAddress) {
    return `${trimmedName} (${trimmedAddress})`;
  }

  return trimmedName ?? trimmedAddress;
}

function formatEventDestination(
  kind: EventKind,
  locationName: string | null,
  locationAddress: string | null
) {
  if (kind === "commute") {
    return PARTICIPANT_CHOSEN_DESTINATIONS_COPY;
  }

  return (
    formatNameAndAddress(locationName, locationAddress) ?? NO_LOCATION_SET_COPY
  );
}

function formatEventType(kind: EventKind, isRecurring: boolean) {
  return `${EVENT_KIND_LABELS[kind]}${isRecurring ? RECURRING_EVENT_TYPE_SUFFIX : ""}`;
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
          destinationLocation: true,
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
  const locationName = event.location?.name ?? null;
  const locationAddress = event.location?.addressString ?? null;
  const eventDestination = formatEventDestination(
    event.kind,
    locationName,
    locationAddress
  );
  const eventDestinationSummaryLabel =
    EVENT_LOCATION_EMAIL_SUMMARY_LABELS[event.kind];
  const eventDestinationLabel = EVENT_LOCATION_EMAIL_LABELS[event.kind];
  const isRecurring = event.eventSeriesId != null;
  const eventType = formatEventType(event.kind, isRecurring);
  const recurringNote = isRecurring
    ? "This is one occurrence of a recurring series."
    : null;

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
          text: [
            `You're invited to join "${event.name}" with ${event.group.name}.`,
            "",
            `When: ${eventDate} at ${eventTime}`,
            `Type: ${eventType}`,
            `${eventDestinationSummaryLabel}: ${eventDestination}`,
            ...(recurringNote ? [recurringNote] : []),
            "",
            `Join the event: ${eventUrl}`,
          ].join("\n"),
          html: `
            <h2>You're Invited!</h2>
            <p>You're invited to join <strong>${event.name}</strong> with ${event.group.name}.</p>
            <p><strong>When:</strong> ${eventDate} at ${eventTime}</p>
            <p><strong>Type:</strong> ${eventType}</p>
            <p><strong>${eventDestinationSummaryLabel}:</strong> ${eventDestination}</p>
            ${recurringNote ? `<p>${recurringNote}</p>` : ""}
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
          destinationLocationId: att.destinationLocationId,
          destinationLocationName: att.destinationLocation?.name ?? null,
          destinationAddress: att.destinationLocation?.addressString ?? null,
          earliestLeaveTime: att.earliestLeaveTime,
          requiredArrivalTime: att.requiredArrivalTime,
        },
      ])
    );

    // Pre-compute estimated times for all parties
    const partyEstimates = await Promise.all(
      sol.parties.map(async (party) => {
        const sortedMembers = party.members.toSorted(
          (a, b) => a.pickupOrder - b.pickupOrder
        );
        const membersForEstimate = buildEstimateMembers(
          sortedMembers,
          attendeeLookup,
          event.locationId,
          event.time
        );

        const estimates = await computePartyEstimates(
          membersForEstimate,
          event.locationId,
          event.time,
          event.kind
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

    for (const { party, sortedMembers, estimates } of partyEstimates) {
      const driverMember = sortedMembers.find(
        (member) => member.userId === party.driverUserId
      );
      const leadMember = driverMember ?? sortedMembers[0] ?? null;
      const leadAtt = leadMember ? attendeeLookup.get(leadMember.userId) : null;
      const finalDestinationName =
        event.kind === "commute"
          ? leadAtt?.destinationLocationName
          : locationName;
      const finalDestinationAddress =
        event.kind === "commute"
          ? leadAtt?.destinationAddress
          : locationAddress;

      for (const member of sortedMembers) {
        const att = attendeeLookup.get(member.userId);
        if (!att) continue;

        const isDriver =
          party.driverUserId != null && member.userId === party.driverUserId;
        const role = isDriver ? "the Driver" : "a Passenger";
        const recipientDestination =
          event.kind === "commute"
            ? (formatNameAndAddress(
                att.destinationLocationName,
                att.destinationAddress
              ) ?? "Your destination")
            : eventDestination;

        // Build itinerary steps
        const steps: { label: string; detail: string; time: string | null }[] =
          [];

        for (const m of sortedMembers) {
          const mAtt = attendeeLookup.get(m.userId);
          const pickup = estimates.estimatedPickups.get(m.userId);
          const timeStr = pickup ? formatTime(pickup) : null;
          const isLeadMember = m.userId === leadMember?.userId;

          if (isLeadMember) {
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

        if (event.kind === "commute") {
          for (const m of sortedMembers.filter(
            (sortedMember) => sortedMember.userId !== leadMember?.userId
          )) {
            const mAtt = attendeeLookup.get(m.userId);
            steps.push({
              label: `Drop off: ${mAtt?.name ?? "Passenger"}`,
              detail:
                mAtt?.destinationAddress ?? mAtt?.destinationLocationName ?? "",
              time: null,
            });
          }
        }

        // Final destination
        const arrivalTime = estimates.estimatedEventArrival
          ? formatTime(estimates.estimatedEventArrival)
          : null;
        steps.push({
          label: `Arrive: ${finalDestinationName ?? "Destination"}`,
          detail: finalDestinationAddress ?? "",
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
          `Type: ${eventType}`,
          `${eventDestinationLabel}: ${recipientDestination}`,
          ...(recurringNote ? [recurringNote] : []),
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
          <p><strong>Type:</strong> ${eventType}</p>
          <p><strong>${eventDestinationLabel}:</strong> ${recipientDestination}</p>
          ${recurringNote ? `<p>${recurringNote}</p>` : ""}
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
