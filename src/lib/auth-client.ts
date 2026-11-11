"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// The OAuth client plugin carries an agent's sign-in request through Google sign-in and consent.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });
