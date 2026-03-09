import { randomPointInRadius } from "@/lib/geo/random-points";
import { googleRouteMatrix } from "@/lib/geo/service";

export {};

async function main() {
  console.log("=== Large Route Matrix Smoke Test (>25x25) ===");
  console.log();

  // Generate 30 locations around Mountain View — enough to exceed the 25x25 limit
  const center = { lat: 37.42, lng: -122.08 };
  const locations = Array.from({ length: 30 }, (_, i) => {
    const pt = randomPointInRadius(center.lat, center.lng, 10);
    return { id: `loc_${i}`, latitude: pt.latitude, longitude: pt.longitude };
  });

  const expectedPairs = locations.length * (locations.length - 1); // 30*29 = 870
  console.log(
    `Computing route matrix for ${locations.length} locations (${expectedPairs} expected pairs)...`
  );
  console.log();

  const results = await googleRouteMatrix(locations);

  console.log(
    `Got ${results.length} distance entries (expected ${expectedPairs})`
  );
  console.log();

  if (results.length !== expectedPairs) {
    throw new Error(
      `Expected ${expectedPairs} pairwise entries for ${locations.length} locations, got ${results.length}`
    );
  }

  for (const r of results) {
    // With random points some may be very close, so 0 is acceptable
    if (r.durationSeconds < 0) {
      throw new Error(
        `Duration should be non-negative: ${r.originLocationId} -> ${r.destinationLocationId} = ${r.durationSeconds}s`
      );
    }
    if (r.distanceMeters < 0) {
      throw new Error(
        `Distance should be non-negative: ${r.originLocationId} -> ${r.destinationLocationId} = ${r.distanceMeters}m`
      );
    }
  }

  console.log("Large route matrix smoke test passed!");
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
