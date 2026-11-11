import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/server/auth";

export const GET = (req: Request) => oauthProviderOpenIdConfigMetadata(getAuth())(req);
