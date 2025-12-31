import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

export { auth as middleware } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const user = await auth();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).+)"],
};
