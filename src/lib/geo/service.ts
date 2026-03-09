import { z } from "zod";

import {
  AutocompletePredictionSchema,
  ComputeRouteResponseSchema,
  PlaceDetailsSchema,
  RouteMatrixEntrySchema,
  type RouteMatrixEntry,
} from "./schema";

// -- Cost control flags --
// TRAFFIC_AWARE doubles Routes API costs (Essentials $5/1K -> Pro $10/1K per element)
const USE_TRAFFIC_AWARE_DISTANCES = false;
// displayName in Place Details pushes from Essentials $5/1K to Pro $17/1K
const USE_API_DISPLAY_NAMES = false;

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

// -- Geocoding API response schemas (internal) --

const googleGeocodingResultSchema = z.object({
  formatted_address: z.string(),
  address_components: z.array(
    z.object({
      long_name: z.string(),
      types: z.array(z.string()),
    })
  ),
  geometry: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  }),
  place_id: z.string(),
});

const googleGeocodingResponseSchema = z.object({
  status: z.string(),
  results: z.array(googleGeocodingResultSchema).default([]),
});

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
        "X-Goog-FieldMask": USE_API_DISPLAY_NAMES
          ? "id,displayName,formattedAddress,addressComponents,location"
          : "id,formattedAddress,addressComponents,location",
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

  const name = USE_API_DISPLAY_NAMES
    ? (data.displayName?.text ?? "")
    : (street1 ?? data.formattedAddress ?? "");

  return PlaceDetailsSchema.parse({
    placeId: data.id,
    name,
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

const MATRIX_BLOCK_SIZE = 25;

/**
 * Fetch a single block of the route matrix for the given origin/destination
 * slices. Indices in the response are relative to the slices, so callers
 * must pass the corresponding location sub-arrays to map back to IDs.
 */
async function fetchRouteMatrixBlock(
  originLocations: { id: string; latitude: number; longitude: number }[],
  destinationLocations: { id: string; latitude: number; longitude: number }[]
) {
  const origins = originLocations.map((loc) => ({
    waypoint: {
      location: {
        latLng: { latitude: loc.latitude, longitude: loc.longitude },
      },
    },
    routeModifiers: { avoidFerries: true },
  }));

  const destinations = destinationLocations.map((loc) => ({
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
        ...(USE_TRAFFIC_AWARE_DISTANCES
          ? { routingPreference: "TRAFFIC_AWARE" satisfies string }
          : {}),
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

  const results: RouteMatrixEntry[] = [];
  for (const entry of data) {
    const origin = originLocations[entry.originIndex];
    const destination = destinationLocations[entry.destinationIndex];
    if (!origin || !destination || origin.id === destination.id) {
      continue;
    }

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

/**
 * Compute driving distances/durations between all origin-destination pairs
 * using the Google Routes Matrix API.
 *
 * `locations` is a list of {id, latitude, longitude}. Returns the full
 * pairwise matrix (every location to every other location).
 *
 * The API limits requests to 625 elements (25x25). For larger matrices we
 * slide a 25x25 block across the full matrix, collecting results from each
 * chunk sequentially.
 */
export async function googleRouteMatrix(
  locations: { id: string; latitude: number; longitude: number }[]
) {
  if (locations.length < 2) return [];

  const n = locations.length;
  if (n <= MATRIX_BLOCK_SIZE) {
    return fetchRouteMatrixBlock(locations, locations);
  }

  const results: RouteMatrixEntry[] = [];
  for (let oStart = 0; oStart < n; oStart += MATRIX_BLOCK_SIZE) {
    const originSlice = locations.slice(
      oStart,
      Math.min(oStart + MATRIX_BLOCK_SIZE, n)
    );
    for (let dStart = 0; dStart < n; dStart += MATRIX_BLOCK_SIZE) {
      const destSlice = locations.slice(
        dStart,
        Math.min(dStart + MATRIX_BLOCK_SIZE, n)
      );
      const blockResults = await fetchRouteMatrixBlock(originSlice, destSlice);
      results.push(...blockResults);
    }
  }

  return results;
}

/**
 * Compute a driving route between two points and return the encoded polyline.
 */
export async function googleComputeRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number }
) {
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask": "routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: { latitude: origin.latitude, longitude: origin.longitude },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.latitude,
              longitude: destination.longitude,
            },
          },
        },
        travelMode: "DRIVE",
        ...(USE_TRAFFIC_AWARE_DISTANCES
          ? { routingPreference: "TRAFFIC_AWARE" satisfies string }
          : {}),
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Compute Route API error: ${response.status} ${text}`
    );
  }

  const data = ComputeRouteResponseSchema.parse(await response.json());
  const route = data.routes[0];
  if (!route) {
    throw new Error("No route returned from Google Compute Route API");
  }

  return { encodedPolyline: route.polyline.encodedPolyline };
}

/**
 * Reverse-geocode a lat/lng pair into a PlaceDetails-compatible shape
 * using the Google Geocoding API.
 */
export async function googleReverseGeocode(lat: number, lng: number) {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${getApiKey()}`
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Reverse Geocode API error: ${response.status} ${text}`
    );
  }

  const data = googleGeocodingResponseSchema.parse(await response.json());

  if (data.status !== "OK" || data.results.length === 0) {
    throw new Error(`Reverse geocoding failed: status=${data.status}`);
  }

  const result = data.results[0]!;

  function findComponent(type: string) {
    return (
      result.address_components.find((c) => c.types.includes(type))
        ?.long_name ?? null
    );
  }

  const streetNumber = findComponent("street_number") ?? "";
  const route = findComponent("route") ?? "";
  const street1 =
    streetNumber || route ? `${streetNumber} ${route}`.trim() || null : null;

  return PlaceDetailsSchema.parse({
    placeId: result.place_id,
    name: result.formatted_address,
    formattedAddress: result.formatted_address,
    street1,
    street2: findComponent("subpremise"),
    city: findComponent("locality") ?? findComponent("sublocality_level_1"),
    state: findComponent("administrative_area_level_1"),
    zip: findComponent("postal_code"),
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
  });
}
