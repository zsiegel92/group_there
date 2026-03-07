export {};

import { decodePolyline } from "@/lib/geo/polyline";
import { googleComputeRoute } from "@/lib/geo/service";

async function main() {
  console.log("=== Compute Route API Smoke Test ===");
  console.log();

  const origin = { latitude: 37.420761, longitude: -122.081356 }; // Googleplex
  const destination = { latitude: 37.383047, longitude: -122.044651 }; // Cupertino area

  console.log(
    `Computing route: (${origin.latitude}, ${origin.longitude}) -> (${destination.latitude}, ${destination.longitude})`
  );
  console.log();

  const result = await googleComputeRoute(origin, destination);

  console.log(
    `Encoded polyline (first 100 chars): ${result.encodedPolyline.slice(0, 100)}...`
  );
  console.log(`Encoded polyline length: ${result.encodedPolyline.length}`);
  console.log();

  if (!result.encodedPolyline) {
    throw new Error("Expected non-empty encoded polyline");
  }

  const decoded = decodePolyline(result.encodedPolyline);
  console.log(`Decoded ${decoded.length} coordinate points`);
  console.log(`First point: [${decoded[0]![0]}, ${decoded[0]![1]}]`);
  console.log(
    `Last point: [${decoded[decoded.length - 1]![0]}, ${decoded[decoded.length - 1]![1]}]`
  );

  if (decoded.length === 0) {
    throw new Error("Expected decoded polyline to have coordinates");
  }

  console.log();
  console.log("Compute Route smoke test passed!");
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
