import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./session";
import { isAdminRole } from "./roles";

export async function requireAdminPage(returnPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(returnPath ?? "/admin/dashboard")}`);
  }
  if (!isAdminRole(user.role)) {
    redirect("/post-login");
  }
  return user;
}
