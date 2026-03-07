import { NextRequest, NextResponse } from "next/server";

import { getUser } from "@/lib/auth";
import { googleAutocomplete } from "@/lib/geo/service";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.length < 3) {
    return NextResponse.json(
      { error: "Query must be at least 3 characters" },
      { status: 400 }
    );
  }

  const predictions = await googleAutocomplete(query);
  return NextResponse.json({ predictions });
}
