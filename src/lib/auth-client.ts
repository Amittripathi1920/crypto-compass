import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

export const authClient = createAuthClient(
  "https://ep-calm-mountain-ayvot686.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth",
  {
    adapter: BetterAuthReactAdapter(),
  }
);

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
export const useSession = authClient.useSession;
