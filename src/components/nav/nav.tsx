import "server-only";

import { ClientNav } from "./client-nav";

export async function Nav() {
  return <ClientNav />;
}

export function NavFallback() {
  return <ClientNav />;
}
