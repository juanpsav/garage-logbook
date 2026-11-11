import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { getPool } from "./db";

/** Anyone can sign up. Emails in ADMIN_EMAILS (comma-separated; ALLOWED_EMAILS is its old name) get the higher daily limits. */
export const isAdmin = (email: string | null | undefined) =>
  !!email &&
  (process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());

export const authConfigured = () =>
  !!(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The MCP endpoint agents connect to. Access tokens are issued for this resource only. */
export const mcpResource = () => `${(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/mcp`;

function createAuth() {
  return betterAuth({
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account",
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // The JWT plugin signs access tokens for agents; its own /token route stays off so browser sessions don't get JWTs.
    disabledPaths: ["/token"],
    plugins: [
      jwt({ disableSettingJwtHeader: true }),
      // OAuth for agents (claude.ai connectors, Claude Code, any MCP client): sign in with Google, approve once.
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource: mcpResource(),
        // Clients identify themselves with a metadata URL (CIMD) or, for older ones, by registering.
        // Registering grants nothing on its own: every connection still needs the owner's sign-in and consent.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        refreshTokenReuseInterval: 0,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | null = null;
export const getAuth = () => (instance ??= createAuth());
