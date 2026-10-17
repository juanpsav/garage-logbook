import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

export const { GET, POST } = toNextJsHandler((req) => getAuth().handler(req));
