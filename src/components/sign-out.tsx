"use client";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

export function SignOut() {
  return (
    <Button
      onClick={() => {
        signOut().then(() => {
          window.location.reload();
        });
      }}
      variant="outline"
      size="sm"
    >
      Sign out
    </Button>
  );
}
