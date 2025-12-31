import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export { auth as middleware } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: "/about/:path*",
};
