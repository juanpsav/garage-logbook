import { Garage } from "@/components/Root";
import { authConfigured } from "@/server/auth";
import { getOwner } from "@/server/session";

export default async function Home() {
  const owner = await getOwner();
  return <Garage owner={owner} signInEnabled={authConfigured()} />;
}
