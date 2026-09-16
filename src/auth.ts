import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function consumeLoginAttempt(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const parsed = z
          .object({ email: z.string().email(), password: z.string().min(8) })
          .safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        if (!consumeLoginAttempt(email)) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;

        attempts.delete(email);
        await prisma.auditLog.create({
          data: { action: "LOGIN", entity: "User", entityId: user.id }
        });
        return { id: user.id, email: user.email, name: user.name };
      }
    })
  ],
  callbacks: {
    authorized: async ({ auth: session, request }) => {
      const pathname = request.nextUrl.pathname;
      const publicPath =
        pathname === "/login" ||
        pathname.startsWith("/api/auth") ||
        pathname === "/api/cron/birthdays";
      return publicPath || Boolean(session);
    }
  }
});
