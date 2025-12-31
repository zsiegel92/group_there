import { signIn } from "@/lib/auth";

export function SignIn() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("github");
      }}
    >
      <button className="bg-blue-500 text-white p-2 rounded-md" type="submit">
        Signin with GitHub
      </button>
    </form>
  );
}
