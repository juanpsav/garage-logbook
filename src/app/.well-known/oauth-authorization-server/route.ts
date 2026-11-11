import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/server/auth";

// OAuth discovery for agents (RFC 8414). Some clients look here, others at the issuer path below.
export const GET = (req: Request) => oauthProviderAuthServerMetadata(getAuth())(req);
