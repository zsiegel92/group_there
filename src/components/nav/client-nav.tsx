"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Spinner } from "@/components/ui/spinner";
import type { User } from "@/lib/auth";
import { useSession } from "@/lib/auth-client";

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

const navLinks: { href: string; text: string }[] = [
  { href: "/teams", text: "Teams" },
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
      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <SignedInDetails user={user} />
      </div>
    </>
  );
}

function LoggedOutNavParts({ isPending }: { isPending: boolean }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <div className="ml-auto flex items-center gap-2 sm:gap-4">
      {!isLoginPage && !isPending && <SignIn />}
      {isPending && <Spinner />}
    </div>
  );
}

export function ClientNav() {
  const { data: session, isPending } = useSession();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-3 sm:gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg sm:text-xl font-bold">GROUPTHERE</span>
          </Link>
          {!session?.user || isPending ? (
            <LoggedOutNavParts isPending={isPending} />
          ) : (
            <LoggedInNavParts user={session.user} />
          )}
        </div>
      </div>
    </nav>
  );
}
