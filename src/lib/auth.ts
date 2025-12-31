import NextAuth, { type Session } from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],
});

export type User = NonNullable<Session["user"]>;

export async function getUser(): Promise<User | null> {
  const session = await auth();
  return session?.user ?? null;
}
