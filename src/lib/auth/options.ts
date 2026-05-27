import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";
import { isRole, type Role } from "./roles";
import { upgradeOwnershipFromOauth } from "@/lib/oauth-ownership";

function buildProviders() {
  const providers: NextAuthOptions["providers"] = [
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
  ];

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      }),
    );
  }

  return providers;
}

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
  providers: buildProviders(),
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "github") return true;
      const ghProfile = profile as
        | { email?: string | null; login?: string; avatar_url?: string; name?: string }
        | undefined;
      if (!ghProfile?.email) return false; // require GitHub email to link to an existing account
      const email = ghProfile.email.toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) return false; // Scaffold: linking only; first-time signup via GitHub disabled until Account adapter wired.
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          githubUsername: ghProfile.login ?? existing.githubUsername,
          image: ghProfile.avatar_url ?? existing.image,
        },
      });
      if (ghProfile.login) {
        try {
          await upgradeOwnershipFromOauth({ userId: existing.id, githubLogin: ghProfile.login });
        } catch (err) {
          console.error("[auth] upgradeOwnershipFromOauth failed", err);
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, account, profile }) {
      if (user) {
        token.uid = (user as any).id as string;
        token.role = (user as any).role;
        token.primaryTenantId = (user as any).primaryTenantId ?? null;
        token.tenantIds = (user as any).tenantIds ?? [];
      }
      if (account?.provider === "github" && (profile as any)?.email && !token.uid) {
        const email = String((profile as any).email).toLowerCase().trim();
        const dbUser = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { select: { tenantId: true } } },
        });
        if (dbUser && isRole(dbUser.role)) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
          token.primaryTenantId = dbUser.primaryTenantId;
          token.tenantIds = dbUser.memberships.map((m) => m.tenantId);
        }
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
