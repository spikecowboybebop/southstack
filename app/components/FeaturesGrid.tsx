import { HardDrive, Smartphone, Zap } from "lucide-react";
import type { ReactNode } from "react";

const features: { icon: ReactNode; title: string; description: string }[] = [
  {
    icon: <Smartphone className="h-6 w-6" />,
    title: "PWA Powered",
    description:
      "Install SouthStack directly to your desktop or mobile. Works like a native app — no app store required.",
  },
  {
    icon: <HardDrive className="h-6 w-6" />,
    title: "Local First",
    description:
      "Your code never leaves your machine. Everything is stored locally in the browser with zero cloud dependencies.",
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: "Lightning Fast",
    description:
      "Zero server round-trips. Every keystroke, every action — instant. The editor runs entirely in your browser.",
  },
];

export default function FeaturesGrid() {
  return (
    <section id="features" className="px-6 py-28">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Built for developers who value speed & privacy
          </h2>
        </div>

        {/* Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border bg-surface p-8 transition-all hover:border-border-light hover:bg-surface-light hover:shadow-lg hover:shadow-indigo-glow"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo/10 text-indigo transition-colors group-hover:bg-indigo/20">
                {feature.icon}
              </div>
              <h3 className="mb-3 text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
