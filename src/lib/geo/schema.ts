import { z } from "zod";

import { locationOwnerTypeValues } from "@/db/schema";

export const LocationSchema = z.object({
  id: z.string(),
  googlePlaceId: z.string().nullable(),
  name: z.string(),
  addressString: z.string(),
  street1: z.string().nullable(),
  street2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  ownerType: z.enum(locationOwnerTypeValues),
  ownerId: z.string(),
});

export type Location = z.infer<typeof LocationSchema>;

export const AutocompletePredictionSchema = z.object({
  placeId: z.string(),
  mainText: z.string(),
  secondaryText: z.string(),
  description: z.string(),
});

export type AutocompletePrediction = z.infer<
  typeof AutocompletePredictionSchema
>;

export const PlaceDetailsSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  formattedAddress: z.string(),
  street1: z.string().nullable(),
  street2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
});

export type PlaceDetails = z.infer<typeof PlaceDetailsSchema>;

export const RouteMatrixEntrySchema = z.object({
  originLocationId: z.string(),
  destinationLocationId: z.string(),
  durationSeconds: z.number(),
  distanceMeters: z.number(),
});

export type RouteMatrixEntry = z.infer<typeof RouteMatrixEntrySchema>;

export const ComputeRouteResponseSchema = z.object({
  routes: z.array(
    z.object({
      polyline: z.object({
        encodedPolyline: z.string(),
      }),
    })
  ),
});

export type ComputeRouteResponse = z.infer<typeof ComputeRouteResponseSchema>;
