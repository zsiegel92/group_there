import { SocialEventDetailPage } from "@/app/events/[id]/social-event-details-page";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  // await delay(5000);
  // TODO: test whether id is for the user's testing group. If it's not the user's testing group, or it's a group the user isn't a member of, or an unscheduled group for which the user isn't an admin, or an event that just doesn't exist, do notFound
  return <SocialEventDetailPage eventId={id} />;
}
