import * as React from "react";
import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  showTrafficLights?: boolean;
};

export function Card({ className, children, showTrafficLights = false, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-panel/82 shadow-card backdrop-blur-sm",
        className
      )}
      {...rest}
    >
      {showTrafficLights ? <TrafficLights className="absolute left-5 top-5" /> : null}
      {children}
    </div>
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-border px-5 py-4", className)} {...rest} />;
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-xl font-medium leading-tight text-ink", className)} {...rest} />;
}

export function TrafficLights({ className }: { className?: string }) {
  return (
    <div className={cn("traffic-lights", className)} aria-hidden="true">
      <span className="traffic-light traffic-light-red" />
      <span className="traffic-light traffic-light-yellow" />
      <span className="traffic-light traffic-light-green" />
    </div>
  );
}
