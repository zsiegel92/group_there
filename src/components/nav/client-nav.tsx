"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";
import type { User } from "@/lib/auth";

import { SignIn } from "../sign-in";
import { SignOut } from "../sign-out";

function SignedInDetails({ user }: { user: User }) {
  return (
    <>
      <div className="flex items-center gap-3">
        {user.image && (
          <Image
            src={user.image}
            alt={user.name ?? "User"}
            width={32}
            height={32}
            className="rounded-full ring-2 ring-border"
          />
        )}
        <div className="hidden sm:block text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-muted-foreground text-xs">{user.email}</div>
        </div>
      </div>
      <SignOut />
    </>
  );
}

export function ClientNav() {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const { data: session, isPending } = useSession();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2">
          <div className="flex items-center gap-3 sm:gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-bold">GROUPTHERE</span>
            </Link>
            {session?.user && (
              <Link
                href="/teams"
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  pathname.startsWith("/teams")
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Teams
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                <span className="hidden sm:inline">Loading...</span>
              </div>
            ) : session?.user ? (
              <SignedInDetails user={session.user} />
            ) : isLoginPage ? null : (
              <SignIn />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
