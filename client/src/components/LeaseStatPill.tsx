/**
 * LeaseStatPill — a readable stacked label/value pill for lease stat strips.
 *
 * Usage:
 *   <LeaseStatStrip>
 *     <LeaseStatPill label="Payment" value="AED 15,000" badge="AED" />
 *     <LeaseStatPill label="Expiry" value="31 Dec 2028" />
 *     <LeaseStatPill label="IBR" value="5.0000%" color="amber" />
 *     <LeaseStatDivider />
 *     <LeaseStatPill label="Liability" value="0.00" color="blue" />
 *     <LeaseStatPill label="ROU NBV" value="0.07" color="emerald" />
 *   </LeaseStatStrip>
 */

import { cn } from "@/lib/utils";

type StatColor = "default" | "blue" | "emerald" | "amber" | "red" | "purple" | "cyan";

const colorMap: Record<StatColor, { label: string; value: string; bg: string }> = {
  default:  { label: "text-muted-foreground",   value: "text-foreground",        bg: "bg-muted/30" },
  blue:     { label: "text-blue-400/80",         value: "text-blue-300",          bg: "bg-blue-500/10" },
  emerald:  { label: "text-emerald-400/80",      value: "text-emerald-300",       bg: "bg-emerald-500/10" },
  amber:    { label: "text-amber-400/80",        value: "text-amber-300",         bg: "bg-amber-500/10" },
  red:      { label: "text-red-400/80",          value: "text-red-300",           bg: "bg-red-500/10" },
  purple:   { label: "text-purple-400/80",       value: "text-purple-300",        bg: "bg-purple-500/10" },
  cyan:     { label: "text-cyan-400/80",         value: "text-cyan-300",          bg: "bg-cyan-500/10" },
};

interface LeaseStatPillProps {
  label: string;
  value: string | number | null | undefined;
  badge?: string;          // optional currency/unit badge shown before value
  color?: StatColor;
  mono?: boolean;          // use monospace font for numbers
  className?: string;
}

export function LeaseStatPill({
  label,
  value,
  badge,
  color = "default",
  mono = true,
  className,
}: LeaseStatPillProps) {
  const c = colorMap[color];
  const displayValue = value === null || value === undefined || value === "" ? "—" : String(value);

  return (
    <div
      className={cn(
        "flex flex-col items-start justify-center gap-0.5 px-3 py-2 rounded-lg min-w-[72px]",
        c.bg,
        className
      )}
    >
      <span className={cn("text-[10px] font-semibold uppercase tracking-widest leading-none", c.label)}>
        {label}
      </span>
      <div className="flex items-baseline gap-1 leading-none mt-0.5">
        {badge && (
          <span className={cn("text-[10px] font-bold uppercase tracking-wide", c.label)}>
            {badge}
          </span>
        )}
        <span
          className={cn(
            "text-sm font-bold leading-none",
            mono && "font-mono tabular-nums",
            c.value
          )}
        >
          {displayValue}
        </span>
      </div>
    </div>
  );
}

/** Thin vertical divider between stat groups */
export function LeaseStatDivider({ className }: { className?: string }) {
  return (
    <div className={cn("self-stretch w-px bg-border/60 mx-1 my-1", className)} />
  );
}

/** Wrapper that lays out pills in a horizontal row */
export function LeaseStatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-stretch gap-1 flex-wrap", className)}>
      {children}
    </div>
  );
}
