// Entry point for the Better Auth CLI (`npm run db:migrate`), which creates its tables.
import { getAuth } from "./src/server/auth";

export const auth = getAuth();
