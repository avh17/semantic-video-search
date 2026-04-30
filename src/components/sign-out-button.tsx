import { Button } from "@/components/ui/button";
import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/auth/sign-in" });
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        Sign Out
      </Button>
    </form>
  );
}
