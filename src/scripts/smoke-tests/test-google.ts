import { googleAutocomplete, googlePlaceDetails } from "@/lib/geo/service";

async function main() {
  console.log("Running all Google API smoke tests...");
  console.log();

  // Test 1: Autocomplete
  console.log("=== Test 1: Places Autocomplete ===");
  console.log();

  const predictions = await googleAutocomplete("1600 Amphitheatre");
  console.log(`Got ${predictions.length} predictions:`);
  for (const p of predictions) {
    console.log(`  - ${p.description}`);
    console.log(`    placeId: ${p.placeId}`);
  }

  if (predictions.length === 0) {
    throw new Error("No autocomplete predictions returned");
  }

  const placeId = predictions[0].placeId;
  console.log();
  console.log("Autocomplete test passed!");
  console.log();

  // Test 2: Place Details
  console.log("=== Test 2: Place Details ===");
  console.log();

  const details = await googlePlaceDetails(placeId);
  console.log(`  Name: ${details.name}`);
  console.log(`  Address: ${details.formattedAddress}`);
  console.log(`  Location: ${details.latitude}, ${details.longitude}`);
  console.log(
    `  City: ${details.city}, State: ${details.state}, Zip: ${details.zip}`
  );

  if (!details.latitude || !details.longitude) {
    throw new Error("Missing lat/lon in place details response");
  }

  console.log();
  console.log("Place details test passed!");
  console.log();

  console.log("All Google API tests passed!");
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
