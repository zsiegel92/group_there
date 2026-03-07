import type {
  AutocompletePrediction,
  PlaceDetails,
  RouteMatrixEntry,
} from "./schema";

function getApiKey() {
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_ROUTES_API_KEY is not set");
  }
  return key;
}

export async function googleAutocomplete(
  query: string
): Promise<AutocompletePrediction[]> {
  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
      },
      body: JSON.stringify({
        input: query,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Autocomplete API error: ${response.status} ${text}`
    );
  }

  const data = await response.json();
  const suggestions = data.suggestions ?? [];

  return suggestions
    .filter((s: Record<string, unknown>) => s.placePrediction)
    .map(
      (s: {
        placePrediction: {
          placeId: string;
          structuredFormat: {
            mainText: { text: string };
            secondaryText: { text: string };
          };
          text: { text: string };
        };
      }) => ({
        placeId: s.placePrediction.placeId,
        mainText: s.placePrediction.structuredFormat.mainText.text,
        secondaryText: s.placePrediction.structuredFormat.secondaryText.text,
        description: s.placePrediction.text.text,
      })
    );
}

export async function googlePlaceDetails(
  placeId: string
): Promise<PlaceDetails> {
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

  const data = await response.json();

  const components: Array<{ types: string[]; longText: string }> =
    data.addressComponents ?? [];

  function findComponent(type: string) {
    return components.find((c) => c.types.includes(type))?.longText ?? null;
  }

  const streetNumber = findComponent("street_number") ?? "";
  const route = findComponent("route") ?? "";
  const street1 =
    streetNumber || route ? `${streetNumber} ${route}`.trim() || null : null;

  return {
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
  };
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
): Promise<RouteMatrixEntry[]> {
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

  const data: Array<{
    originIndex: number;
    destinationIndex: number;
    duration?: string;
    distanceMeters?: number;
    status?: { code?: number };
    condition?: string;
  }> = await response.json();

  const results: RouteMatrixEntry[] = [];
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

    results.push({
      originLocationId: origin.id,
      destinationLocationId: destination.id,
      durationSeconds,
      distanceMeters: entry.distanceMeters ?? 0,
    });
  }

  return results;
}
