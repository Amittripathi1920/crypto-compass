import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "https://ep-calm-mountain-ayvot686.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth",
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
