"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AddressSelectorAndCard } from "@/components/address-selector-and-card";
import { useDialog } from "@/components/dialog-provider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { EventKind } from "@/db/schema";
import type { Location } from "@/lib/geo/schema";
import type { Problem, Solution } from "@/python-client";

import { useEventDetails } from "../../api/events/client";
import {
  useDeleteAllRiders,
  useGenerateRiders,
  useTestRiders,
} from "../../api/testing-events/client";
import { DeleteEventButton } from "./delete-event-button";
import { DistanceStatus } from "./distance-status";
import { EditEventButton } from "./edit-event-button";
import { EventDetailsCard } from "./event-details-card";
import { EventMapPanel } from "./event-map-panel";
import { EventStatus } from "./event-status";
import { MetricsPanel } from "./metrics-panel";
import { loadSolveResult } from "./solve-action";
import { TestingRiderTable } from "./testing-rider-table";

function useSolveResult(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["events", eventId, "solve-result"],
    queryFn: () => loadSolveResult(eventId),
    enabled,
  });
}

function buildRiderLocation(
  location: {
    id: string;
    name: string;
    addressString: string;
    latitude: number | null;
    longitude: number | null;
  } | null,
  userId: string
): Location | null {
  if (!location) return null;
  return {
    id: location.id,
    googlePlaceId: null,
    name: location.name,
    addressString: location.addressString,
    street1: null,
    street2: null,
    city: null,
    state: null,
    zip: null,
    latitude: location.latitude,
    longitude: location.longitude,
    ownerType: "user",
    ownerId: userId,
  } satisfies Location;
}

export function TestingEventDetailPage({ eventId }: { eventId: string }) {
  const { data, isLoading, error } = useEventDetails(eventId);
  const { data: ridersData } = useTestRiders(eventId);
  const [ephemeralSolveResult, setEphemeralSolveResult] = useState<{
    problem: Problem;
    solution: Solution;
  } | null>(null);
  const [isSolving, setIsSolving] = useState(false);

  const event = data?.event;
  const riders = ridersData?.riders;

  const { data: persistedSolveResult, isLoading: isLoadingPersisted } =
    useSolveResult(eventId, !!event?.locked);

  const solveResult = ephemeralSolveResult ?? persistedSolveResult ?? null;
  const isLoadingMetrics = isSolving || (!!event?.locked && isLoadingPersisted);

  const handleSolutionGenerated = useCallback(
    (result: { problem: Problem; solution: Solution }) => {
      setEphemeralSolveResult(result);
      setIsSolving(false);
    },
    []
  );

  const handleSolveStart = useCallback(() => {
    setIsSolving(true);
    setEphemeralSolveResult(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-600">Error loading event: {error.message}</div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
              {event.name}
            </h1>
            <Link
              href={`/groups/${event.groupId}`}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Group: {event.groupName}
            </Link>
          </div>
          {!event.locked && (
            <div className="flex flex-wrap gap-2">
              <EditEventButton event={event} eventId={eventId} />
              <DeleteEventButton eventId={eventId} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 border border-dashed border-gray-300">
            Testing Playground
          </div>
          <EventStatus
            scheduled={event.scheduled}
            locked={event.locked}
            hideUnscheduled
          />
        </div>
      </div>

      <div className="space-y-6">
        <EventDetailsCard
          kind={event.kind}
          eventSeriesId={event.eventSeriesId}
          time={event.time}
          location={event.location}
          message={event.message}
        />

        <GenerateRidersPanel
          eventKind={event.kind}
          eventId={eventId}
          riderCount={riders?.length ?? 0}
          locked={event.locked}
        />

        <TestingRiderTable
          riders={riders ?? []}
          eventId={eventId}
          eventTime={event.time}
          locked={event.locked}
        />

        <DistanceStatus eventId={eventId} isAdmin={true} />

        <EventMapPanel
          event={{
            kind: event.kind,
            location: event.location,
            locationId: event.locationId,
            locked: event.locked,
            attendees: (riders ?? []).map((r) => ({
              userId: r.userId,
              userName: r.userName,
              userEmail: r.userEmail,
              userAttendance: {
                originLocationId: r.originLocationId,
                originLocation: buildRiderLocation(r.originLocation, r.userId),
                destinationLocationId: r.destinationLocationId,
                destinationLocation: buildRiderLocation(
                  r.destinationLocation,
                  r.userId
                ),
              },
            })),
            isAdmin: true,
            solution: event.solution,
          }}
          eventId={eventId}
          currentUserId={undefined}
          onSolutionGenerated={handleSolutionGenerated}
          onSolveStart={handleSolveStart}
        />

        <MetricsPanel solveResult={solveResult} isLoading={isLoadingMetrics} />
      </div>
    </div>
  );
}

function GenerateRidersPanel({
  eventKind,
  eventId,
  riderCount,
  locked,
}: {
  eventKind: EventKind;
  eventId: string;
  riderCount: number;
  locked: boolean;
}) {
  const [count, setCount] = useState(5);
  const [radiusMiles, setRadiusMiles] = useState(15);
  const [selectedCenterLocation, setSelectedCenterLocation] =
    useState<Location | null>(null);
  const generateRiders = useGenerateRiders();
  const deleteAllRiders = useDeleteAllRiders();
  const dialog = useDialog();
  const commuteNeedsCenter = eventKind === "commute" && !selectedCenterLocation;

  return (
    <div className="bg-gray-50 p-6 rounded-lg border border-dashed border-gray-300">
      <h2 className="text-xl font-semibold mb-4">
        Generate Riders ({riderCount} total)
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        {eventKind === "commute" && (
          <div className="min-w-72 flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Generation Center
            </label>
            <AddressSelectorAndCard
              onNewValidatedLocation={setSelectedCenterLocation}
              ownerType="event"
              ownerId={eventId}
              selectedLocation={selectedCenterLocation}
              disabled={locked || generateRiders.isPending}
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Count
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="w-20 px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Radius (miles)
          </label>
          <input
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(parseFloat(e.target.value) || 5)}
            className="w-24 px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <Button
          onClick={() =>
            generateRiders.mutate({
              eventId,
              input: {
                count,
                radiusMiles,
                centerLocationId: selectedCenterLocation?.id,
              },
            })
          }
          disabled={locked || generateRiders.isPending || commuteNeedsCenter}
        >
          {generateRiders.isPending ? "Generating..." : "Generate"}
        </Button>
        {riderCount > 0 && (
          <Button
            variant="secondary"
            onClick={async () => {
              const confirmed = await dialog.confirm("Delete all test riders?");
              if (confirmed) {
                deleteAllRiders.mutate(eventId);
              }
            }}
            disabled={locked || deleteAllRiders.isPending}
          >
            {deleteAllRiders.isPending ? "Deleting..." : "Delete All"}
          </Button>
        )}
      </div>
      {generateRiders.isPending && (
        <div className="flex items-center gap-2 text-gray-600 mt-3">
          <Spinner className="size-3.5" />
          <span className="text-sm">
            Generating riders and reverse geocoding locations...
          </span>
        </div>
      )}
    </div>
  );
}
