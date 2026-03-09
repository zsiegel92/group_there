import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { SocialEventDetailPage } from "@/app/events/[id]/social-event-details-page";
import { TestingEventDetailPage } from "@/app/events/[id]/testing-event-details-page";
import { db } from "@/db/db";
import { events } from "@/db/schema";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await db.query.events.findFirst({
    where: eq(events.id, id),
    with: {
      group: true,
    },
  });

  if (!event) {
    notFound();
  }

  if (event.group.type === "testing") {
    return <TestingEventDetailPage eventId={id} />;
  }

  return <SocialEventDetailPage eventId={id} />;
}
