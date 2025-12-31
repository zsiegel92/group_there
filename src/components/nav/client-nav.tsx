import type { User } from "@/lib/auth";
import { Spinner } from "@/components/ui/spinner";
import Image from "next/image";
import { SignIn } from "../sign-in";

export function ClientNav({
  user,
  loading,
}: {
  user: User | null;
  loading?: boolean;
}) {
  if (!user) {
    return (
      <div>
        {loading ? <Spinner /> : null}Not logged in <SignIn />
      </div>
    );
  }
  return (
    <div>
      <Image
        src={user?.image ?? ""}
        alt={user?.name ?? ""}
        width={32}
        height={32}
      />
      Logged in as {user?.name} ({user?.email})
    </div>
  );
}
