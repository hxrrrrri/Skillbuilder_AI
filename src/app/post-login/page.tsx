import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { landingPathForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function PostLoginPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(landingPathForRole(user.role));
}
