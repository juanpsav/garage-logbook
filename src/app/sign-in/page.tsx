import { SignInCard } from "./SignInCard";

export const metadata = { title: "Sign in · Garage Logbook" };

/** Where an agent (Claude, or another MCP client) sends you to sign in before connecting to your garage. */
export default function SignInPage() {
  return (
    <div className="wrap narrow">
      <header className="top"><h1>Garage Logbook</h1></header>
      <SignInCard />
    </div>
  );
}
