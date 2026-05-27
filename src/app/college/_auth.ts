import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/auth/roles";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { CollegeAuthError, resolveCollegeScope, type CollegeTenantScope } from "@/lib/college/tenant";

export async function getCollegePageContext(callbackUrl: string): Promise<{
  user: SessionUser;
  scope: CollegeTenantScope | null;
  noTenant: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (!["college_admin", "college_member"].includes(user.role) && !isAdminRole(user.role)) {
    redirect("/post-login");
  }
  try {
    return { user, scope: resolveCollegeScope(user), noTenant: false };
  } catch (err) {
    if (err instanceof CollegeAuthError) return { user, scope: null, noTenant: true };
    throw err;
  }
}
