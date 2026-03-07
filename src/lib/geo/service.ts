import { z } from "zod";

import {
  AutocompletePredictionSchema,
  PlaceDetailsSchema,
  RouteMatrixEntrySchema,
} from "./schema";

function getApiKey() {
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_ROUTES_API_KEY is not set");
  }
  return key;
}

// -- Raw Google API response schemas (internal) --

const googleAutocompleteSuggestionSchema = z.object({
  placePrediction: z
    .object({
      placeId: z.string(),
      structuredFormat: z.object({
        mainText: z.object({ text: z.string() }),
        secondaryText: z.object({ text: z.string() }),
      }),
      text: z.object({ text: z.string() }),
    })
    .optional(),
});

const googleAutocompleteResponseSchema = z.object({
  suggestions: z.array(googleAutocompleteSuggestionSchema).default([]),
});

const googleAddressComponentSchema = z.object({
  types: z.array(z.string()),
  longText: z.string(),
});

const googlePlaceDetailsResponseSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  addressComponents: z.array(googleAddressComponentSchema).default([]),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
});

const googleRouteMatrixElementSchema = z.object({
  originIndex: z.number(),
  destinationIndex: z.number(),
  duration: z.string().optional(),
  distanceMeters: z.number().optional(),
  status: z.object({ code: z.number().optional() }).optional(),
  condition: z.string().optional(),
});

const googleRouteMatrixResponseSchema = z.array(googleRouteMatrixElementSchema);

// -- Public API functions --

export async function googleAutocomplete(query: string) {
  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
      },
      body: JSON.stringify({ input: query }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Autocomplete API error: ${response.status} ${text}`
    );
  }

  const data = googleAutocompleteResponseSchema.parse(await response.json());

  return data.suggestions.flatMap((s) => {
    if (!s.placePrediction) return [];
    const p = s.placePrediction;
    return [
      AutocompletePredictionSchema.parse({
        placeId: p.placeId,
        mainText: p.structuredFormat.mainText.text,
        secondaryText: p.structuredFormat.secondaryText.text,
        description: p.text.text,
      }),
    ];
  });
}

export async function googlePlaceDetails(placeId: string) {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,addressComponents,location",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Place Details API error: ${response.status} ${text}`
    );
  }

  const data = googlePlaceDetailsResponseSchema.parse(await response.json());

  function findComponent(type: string) {
    return (
      data.addressComponents.find((c) => c.types.includes(type))?.longText ??
      null
    );
  }

  const streetNumber = findComponent("street_number") ?? "";
  const route = findComponent("route") ?? "";
  const street1 =
    streetNumber || route ? `${streetNumber} ${route}`.trim() || null : null;

  return PlaceDetailsSchema.parse({
    placeId: data.id,
    name: data.displayName?.text ?? "",
    formattedAddress: data.formattedAddress ?? "",
    street1,
    street2: findComponent("subpremise"),
    city: findComponent("locality") ?? findComponent("sublocality_level_1"),
    state: findComponent("administrative_area_level_1"),
    zip: findComponent("postal_code"),
    latitude: data.location?.latitude ?? 0,
    longitude: data.location?.longitude ?? 0,
  });
}

/**
 * Compute driving distances/durations between all origin-destination pairs
 * using the Google Routes Matrix API.
 *
 * `locations` is a list of {id, latitude, longitude}. Returns the full
 * pairwise matrix (every location to every other location).
 */
export async function googleRouteMatrix(
  locations: { id: string; latitude: number; longitude: number }[]
) {
  if (locations.length < 2) return [];

  const origins = locations.map((loc) => ({
    waypoint: {
      location: {
        latLng: { latitude: loc.latitude, longitude: loc.longitude },
      },
    },
    routeModifiers: { avoidFerries: true },
  }));

  const destinations = locations.map((loc) => ({
    waypoint: {
      location: {
        latLng: { latitude: loc.latitude, longitude: loc.longitude },
      },
    },
  }));

  const response = await fetch(
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask":
          "originIndex,destinationIndex,duration,distanceMeters,status,condition",
      },
      body: JSON.stringify({
        origins,
        destinations,
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Route Matrix API error: ${response.status} ${text}`
    );
  }
  const rawResponse = await response.json();
  const data = googleRouteMatrixResponseSchema.parse(rawResponse);

  const results = [];
  for (const entry of data) {
    const origin = locations[entry.originIndex];
    const destination = locations[entry.destinationIndex];
    if (
      entry.originIndex === entry.destinationIndex ||
      !origin ||
      !destination
    ) {
      continue;
    }

    // duration comes as "123s" string — parse to seconds
    const durationSeconds = entry.duration
      ? parseInt(entry.duration.replace("s", ""), 10)
      : 0;

    results.push(
      RouteMatrixEntrySchema.parse({
        originLocationId: origin.id,
        destinationLocationId: destination.id,
        durationSeconds,
        distanceMeters: entry.distanceMeters ?? 0,
      })
    );
  }

  return results;
}
