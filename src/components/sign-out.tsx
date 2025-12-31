"use client";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth-actions";

export function SignOut() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}
