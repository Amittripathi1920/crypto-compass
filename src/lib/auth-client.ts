import { createInternalNeonAuth, type ReactBetterAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react/adapters";

const internalAuth = createInternalNeonAuth(
  "https://ep-calm-mountain-ayvot686.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth",
  {
    adapter: BetterAuthReactAdapter(),
  }
);

export const authClient = (internalAuth.adapter as any) as ReactBetterAuthClient;
export const getJWTToken = internalAuth.getJWTToken;

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
export const useSession = authClient.useSession;
