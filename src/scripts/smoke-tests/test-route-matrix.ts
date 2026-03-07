import { googleRouteMatrix } from "@/lib/geo/service";

export {};

async function main() {
  console.log("=== Route Matrix API Smoke Test ===");
  console.log();

  // Three locations in the Mountain View / Sunnyvale area
  const locations = [
    { id: "loc_a", latitude: 37.420761, longitude: -122.081356 }, // Googleplex
    { id: "loc_b", latitude: 37.403184, longitude: -122.097371 }, // Sunnyvale
    { id: "loc_c", latitude: 37.383047, longitude: -122.044651 }, // Cupertino area
  ];

  console.log("Computing route matrix for 3 locations...");
  console.log(
    locations
      .map((l) => `  ${l.id}: (${l.latitude}, ${l.longitude})`)
      .join("\n")
  );
  console.log();

  const results = await googleRouteMatrix(locations);

  console.log(`Got ${results.length} distance entries (expected 6):`);
  for (const r of results) {
    console.log(
      `  ${r.originLocationId} -> ${r.destinationLocationId}: ${r.durationSeconds}s, ${r.distanceMeters}m`
    );
  }
  console.log();

  if (results.length !== 6) {
    throw new Error(
      `Expected 6 pairwise entries for 3 locations, got ${results.length}`
    );
  }

  for (const r of results) {
    if (r.durationSeconds <= 0) {
      throw new Error(
        `Duration should be positive: ${r.originLocationId} -> ${r.destinationLocationId} = ${r.durationSeconds}s`
      );
    }
    if (r.distanceMeters <= 0) {
      throw new Error(
        `Distance should be positive: ${r.originLocationId} -> ${r.destinationLocationId} = ${r.distanceMeters}m`
      );
    }
  }

  console.log("Route Matrix smoke test passed!");
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
