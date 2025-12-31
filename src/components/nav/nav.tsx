import "server-only";
import { getUser } from "@/lib/auth";
import { ClientNav } from "./client-nav";

export async function Nav() {
  const user = await getUser();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <ClientNav user={user} />;
}

export function NavFallback() {
  return <ClientNav user={null} loading={true} />;
}
