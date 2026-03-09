import { googleReverseGeocode } from "@/lib/geo/service";

export {};

async function main() {
  console.log("=== Reverse Geocode Smoke Test ===");
  console.log();

  // Google HQ coordinates
  const lat = 37.4221;
  const lng = -122.0841;

  console.log(`Reverse geocoding: ${lat}, ${lng}`);
  const details = await googleReverseGeocode(lat, lng);

  console.log(`  Name: ${details.name}`);
  console.log(`  Address: ${details.formattedAddress}`);
  console.log(`  Location: ${details.latitude}, ${details.longitude}`);
  console.log(
    `  City: ${details.city}, State: ${details.state}, Zip: ${details.zip}`
  );

  if (!details.latitude || !details.longitude) {
    throw new Error("Missing lat/lon in reverse geocode response");
  }

  console.log();
  console.log("Reverse geocode test passed!");
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
