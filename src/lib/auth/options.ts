import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";
import { isRole, type Role } from "./roles";

declare module "next-auth" {
  interface User {
    role: Role;
    primaryTenantId: string | null;
    tenantIds: string[];
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      primaryTenantId: string | null;
      tenantIds: string[];
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    primaryTenantId: string | null;
    tenantIds: string[];
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { select: { tenantId: true } } },
        });
        if (!user || user.status !== "active") return null;
        if (!isRole(user.role)) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? null,
          role: user.role,
          primaryTenantId: user.primaryTenantId,
          tenantIds: user.memberships.map((m) => m.tenantId),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.uid = user.id as string;
        token.role = (user as any).role;
        token.primaryTenantId = (user as any).primaryTenantId ?? null;
        token.tenantIds = (user as any).tenantIds ?? [];
      }
      if (trigger === "update" && token.uid) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.uid },
          include: { memberships: { select: { tenantId: true } } },
        });
        if (fresh && isRole(fresh.role)) {
          token.role = fresh.role;
          token.primaryTenantId = fresh.primaryTenantId;
          token.tenantIds = fresh.memberships.map((m) => m.tenantId);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.uid) {
        session.user = {
          id: token.uid,
          email: session.user?.email ?? "",
          name: session.user?.name ?? "",
          image: session.user?.image ?? null,
          role: token.role,
          primaryTenantId: token.primaryTenantId,
          tenantIds: token.tenantIds ?? [],
        };
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
