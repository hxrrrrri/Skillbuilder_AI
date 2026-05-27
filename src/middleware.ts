import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import { canAccessPath, isRole, landingPathForRole, type Role } from "@/lib/auth/roles";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const role: Role | null = token && isRole(token.role) ? (token.role as Role) : null;

    if (!role) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
      return NextResponse.redirect(url);
    }

    if (!canAccessPath(role, pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = landingPathForRole(role);
      url.searchParams.set("forbidden", "1");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: () => true,
    },
  },
);

export const config = {
  // Mission pages render run data fetched from `/api/runs/[id]`, which now requires
  // an authenticated session. We include the prefix here so unauthenticated visitors
  // get a clean redirect to /login instead of a broken "failed to fetch" UI.
  matcher: [
    "/admin/:path*",
    "/candidate/:path*",
    "/employer/:path*",
    "/college/:path*",
    "/mission/:path*",
  ],
};
