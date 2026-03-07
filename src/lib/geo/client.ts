"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  AutocompletePredictionSchema,
  LocationSchema,
  PlaceDetailsSchema,
  type AutocompletePrediction,
  type Location,
  type PlaceDetails,
} from "./schema";

export async function searchPlaces(
  query: string
): Promise<AutocompletePrediction[]> {
  const response = await fetch(
    `/api/geo/autocomplete?q=${encodeURIComponent(query)}`
  );
  if (!response.ok) {
    throw new Error("Failed to search places");
  }
  const data = await response.json();
  return z.array(AutocompletePredictionSchema).parse(data.predictions);
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const response = await fetch(
    `/api/geo/place-details?placeId=${encodeURIComponent(placeId)}`
  );
  if (!response.ok) {
    throw new Error("Failed to get place details");
  }
  const data = await response.json();
  return PlaceDetailsSchema.parse(data.details);
}

export async function createLocation(input: {
  googlePlaceId: string | null;
  name: string;
  addressString: string;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  ownerType: "user" | "event";
  ownerId: string;
}): Promise<Location> {
  const response = await fetch("/api/geo/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Failed to create location");
  }
  const data = await response.json();
  return LocationSchema.parse(data.location);
}

export async function fetchOwnerLocations(
  ownerType: string,
  ownerId: string
): Promise<Location[]> {
  const response = await fetch(
    `/api/geo/locations?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch locations");
  }
  const data = await response.json();
  return z.array(LocationSchema).parse(data.locations);
}

export function useOwnerLocations(ownerType: string, ownerId: string) {
  return useQuery({
    queryKey: ["locations", ownerType, ownerId],
    queryFn: () => fetchOwnerLocations(ownerType, ownerId),
    enabled: ownerId.length > 0,
  });
}

export function useSearchPlaces(query: string) {
  return useQuery({
    queryKey: ["places", "autocomplete", query],
    queryFn: () => searchPlaces(query),
    enabled: query.length >= 3,
  });
}

export function usePlaceDetails(placeId: string | null) {
  return useQuery({
    queryKey: ["places", "details", placeId],
    queryFn: () => getPlaceDetails(placeId!),
    enabled: placeId !== null,
  });
}
