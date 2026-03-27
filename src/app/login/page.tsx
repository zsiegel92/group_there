import { SignIn } from "@/components/sign-in";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold">Sign In</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Sign in to access GROUPTHERE and start coordinating rides with your
            group
          </p>
        </div>
        <SignIn callbackUrl={callbackUrl} variant="page" />
      </div>
    </div>
  );
}
