import { PageHeader } from "@/components/page-header";
import { SafetyProtocol } from "@/components/safety/safety-protocol";

export const metadata = { title: "Safety card" };

export default function SafetyCardPage() {
  return (
    <section className="space-y-6">
      <PageHeader title="Safety card" className="sr-only" />
      <SafetyProtocol />
    </section>
  );
}
