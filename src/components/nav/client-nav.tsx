"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Spinner } from "@/components/ui/spinner";
import type { User } from "@/lib/auth";
import { useSession } from "@/lib/auth-client";

import { SignIn } from "../sign-in";
import { SignOut } from "../sign-out";

function SignedInDetails({ user }: { user: User }) {
  const showMobileIdentity = Boolean(user.image);

  return (
    <>
      {(showMobileIdentity || user.name || user.email) && (
        <div
          className={
            showMobileIdentity
              ? "flex min-w-0 items-center gap-3"
              : "hidden min-w-0 items-center gap-3 sm:flex"
          }
        >
          {user.image && (
            <Image
              src={user.image}
              alt={user.name ?? "User"}
              width={32}
              height={32}
              className="rounded-full ring-2 ring-border"
            />
          )}
          <div className="hidden min-w-0 sm:block text-sm">
            <div className="truncate font-medium">{user.name}</div>
            <div className="text-muted-foreground truncate text-xs">
              {user.email}
            </div>
          </div>
        </div>
      )}
      <SignOut />
    </>
  );
}

const navLinks: { href: string; text: string }[] = [
  { href: "/groups", text: "Groups" },
  { href: "/events", text: "Events" },
];

function LoggedInNavParts({ user }: { user: User }) {
  const pathname = usePathname();
  return (
    <>
      {navLinks.map((link) => {
        const isActive = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm font-medium transition-colors hover:text-primary ${
              isActive
                ? "text-foreground font-semibold underline underline-offset-4"
                : "text-muted-foreground"
            }`}
          >
            {link.text}
          </Link>
        );
      })}
      <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4">
        <SignedInDetails user={user} />
      </div>
    </>
  );
}

function LoggedOutNavParts({
  isPending,
  sessionChecked,
}: {
  isPending: boolean;
  sessionChecked: boolean;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const showSpinner = !sessionChecked && isPending;
  const showAuth = !isLoginPage && sessionChecked;

  if (!showSpinner && !showAuth) {
    return null;
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end sm:gap-4">
      {showSpinner && <Spinner />}
      {showAuth && (
        <div className="min-w-0 flex-1 sm:flex-none">
          <SignIn variant="nav" />
        </div>
      )}
    </div>
  );
}

export function ClientNav() {
  const { data: session, isPending } = useSession();
  // Once the initial session check completes, keep SignIn mounted so that
  // better-auth's refetchOnWindowFocus doesn't destroy OTP form state.
  const [sessionChecked, setSessionChecked] = useState(false);
  if (!isPending && !sessionChecked) {
    setSessionChecked(true);
  }

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-3 py-3 sm:h-16 sm:flex-nowrap sm:gap-8 sm:py-0">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="text-lg sm:text-xl font-bold">GROUPTHERE</span>
          </Link>
          {!session?.user || isPending ? (
            <LoggedOutNavParts
              isPending={isPending}
              sessionChecked={sessionChecked}
            />
          ) : (
            <LoggedInNavParts user={session.user} />
          )}
        </div>
      </div>
    </nav>
  );
}
