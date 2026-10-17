import "server-only";

export type Owner = { id: string; email: string };

/** The signed-in owner, or null for guests. Filled in when sign-in is added. */
export async function getOwner(): Promise<Owner | null> {
  return null;
}
