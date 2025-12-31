import { SignIn } from "@/components/sign-in";

export default async function LoginPage() {
  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Sign In</h1>
          <p className="text-muted-foreground">
            Sign in to access GROUPTHERE and start coordinating rides with your
            team
          </p>
        </div>
        <div className="flex justify-center">
          <SignIn />
        </div>
      </div>
    </div>
  );
}
