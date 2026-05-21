import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface GenAIFillButtonProps {
  formType: string;
  existingData?: Record<string, unknown>;
  onFill: (data: Record<string, string>) => void;
  className?: string;
  size?: "sm" | "default" | "lg";
  label?: string;
}

/**
 * GenAIFillButton — a reusable "Gen AI" button that calls the server-side
 * aiFill.fillForm procedure and passes the returned realistic sample data
 * to the parent form via the `onFill` callback.
 *
 * Usage:
 *   <GenAIFillButton
 *     formType="new_lease"
 *     existingData={{ assetClass: "OFFICE" }}
 *     onFill={(data) => {
 *       setLeaseRef(data.leaseRef ?? "");
 *       setLessorName(data.lessorName ?? "");
 *       // ... etc
 *     }}
 *   />
 */
export function GenAIFillButton({
  formType,
  existingData,
  onFill,
  className,
  size = "sm",
  label = "Gen AI",
}: GenAIFillButtonProps) {
  const { data: aiHealth } = trpc.system.aiHealth.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const fillMutation = trpc.aiFill.fillForm.useMutation({
    onSuccess: (data) => {
      onFill(data);
      toast.success("AI filled the form with realistic sample data");
    },
    onError: (err) => {
      toast.error(`AI fill failed: ${err.message}`);
    },
  });

  const handleClick = () => {
    if (aiHealth && !aiHealth.ok) {
      toast.error("Azure OpenAI is not ready", {
        description: aiHealth.missing?.length
          ? `Missing: ${aiHealth.missing.join(", ")}`
          : "Check Azure OpenAI configuration.",
      });
      return;
    }

    fillMutation.mutate({ formType, existingData });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={`gap-1.5 border-violet-500/40 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 hover:border-violet-400 transition-colors ${className ?? ""}`}
      onClick={handleClick}
      disabled={fillMutation.isPending || aiHealth?.ok === false}
      title={
        aiHealth?.ok === false
          ? `Azure OpenAI not ready: ${aiHealth.missing?.join(", ") || "configuration missing"}`
          : "Fill form with AI-generated realistic sample data"
      }
    >
      {fillMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      {fillMutation.isPending ? "Generating…" : label}
    </Button>
  );
}
