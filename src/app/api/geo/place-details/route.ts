import { NextRequest, NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { googlePlaceDetails } from "@/lib/geo/service";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const placeId = request.nextUrl.searchParams.get("placeId");
  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  const details = await googlePlaceDetails(placeId);
  return NextResponse.json({ details });
}
