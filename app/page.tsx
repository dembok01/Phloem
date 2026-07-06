import { redirect } from "next/navigation";

// Middleware routes authenticated users to their §10 role landing before this
// renders; anyone reaching it is signed out.
export default function RootPage() {
  redirect("/login");
}
