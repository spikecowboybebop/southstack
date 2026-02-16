import { Download, Globe, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

const steps: { num: string; icon: ReactNode; title: string; description: string }[] = [
  {
    num: "01",
    icon: <Globe className="h-6 w-6" />,
    title: "Visit the URL",
    description: "Open SouthStack in any modern browser. No downloads, no sign-ups.",
  },
  {
    num: "02",
    icon: <Download className="h-6 w-6" />,
    title: "Install the PWA",
    description: "Click 'Install' to add it to your desktop. One click, fully offline-capable.",
  },
  {
    num: "03",
    icon: <WifiOff className="h-6 w-6" />,
    title: "Code Offline",
    description: "Disconnect from the internet and keep coding. Your work is saved locally.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-28">
      <div className="mx-auto max-w-5xl">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo">
            How it Works
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            From browser to offline in 3 steps
          </h2>
        </div>

        {/* Steps */}
        <div className="relative grid gap-8 md:grid-cols-3 md:gap-6">
          {/* Connector lines (desktop only) */}
          <div className="pointer-events-none absolute top-12 left-[calc(16.67%+24px)] hidden h-px w-[calc(66.66%-48px)] md:block">
            <div className="h-full w-full border-t-2 border-dashed border-border-light" />
          </div>

          {steps.map((step) => (
            <div key={step.num} className="relative flex flex-col items-center text-center">
              {/* Step Number Badge */}
              <div className="relative mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-indigo bg-indigo/10 text-indigo">
                  {step.icon}
                </div>
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo text-[10px] font-bold text-white">
                  {step.num}
                </span>
              </div>

              <h3 className="mb-2 text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="max-w-xs text-sm leading-relaxed text-muted">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
