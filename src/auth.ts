import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { NextResponse } from "next/server";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const email = typeof profile?.email === "string" ? profile.email : null;
      const emailVerified = (profile as { email_verified?: boolean } | undefined)?.email_verified;

      return Boolean(email && emailVerified === true);
    },
    authorized({ request, auth }) {
      const isSignedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      if (pathname.startsWith("/dashboard") && !isSignedIn) {
        return NextResponse.redirect(new URL("/auth/sign-in", request.nextUrl));
      }

      return true;
    },
  },
});
