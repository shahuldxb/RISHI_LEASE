import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg" | "xl" | "2xl" | "full";
  headerAction?: ReactNode;
}

/**
 * SlidePanel — renders as a full-width inline form that replaces the list view
 * inside the dashboard content area. No overlay, no popup, no backdrop.
 * The left sidebar stays fully visible. The right content area shows the form.
 * When open=false, nothing is rendered and the parent controls what shows.
 */
export default function SlidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  headerAction,
}: SlidePanelProps) {
  if (!open) return null;

  return (
    <div className="flex flex-col w-full h-full min-h-0 bg-background">
      {/* ── Header bar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-[#161616] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={onClose}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {headerAction && (
          <div className="flex items-center gap-2 ml-4 shrink-0">
            {headerAction}
          </div>
        )}
      </div>

      {/* ── Scrollable form body ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {children}
      </div>

      {/* ── Footer actions ─────────────────────────────────────────────── */}
      {footer && (
        <div className="shrink-0 border-t border-border px-6 py-4 bg-[#161616] flex items-center justify-end gap-3">
          {footer}
        </div>
      )}
    </div>
  );
}
