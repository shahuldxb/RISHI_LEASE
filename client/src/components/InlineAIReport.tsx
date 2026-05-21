import { Streamdown } from "streamdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";

type InlineAIReportProps = {
  title: string;
  leaseLabel?: string;
  content?: string | null;
  generatedAt?: string | null;
  generatedBy?: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
};

export function InlineAIReport({
  title,
  leaseLabel,
  content,
  generatedAt,
  generatedBy,
  isGenerating,
  onGenerate,
}: InlineAIReportProps) {
  return (
    <Card className="border-amber-500/30 bg-amber-950/10">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-600">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {leaseLabel && <Badge variant="outline">{leaseLabel}</Badge>}
              {generatedAt && <span>Generated {new Date(generatedAt).toLocaleString()}</span>}
              {generatedBy && <span>by {generatedBy}</span>}
            </div>
          </div>
        </div>
        <Button size="sm" onClick={onGenerate} disabled={isGenerating} className="gap-2">
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : content ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {isGenerating ? "Generating" : content ? "Regenerate" : "Generate AI Report"}
        </Button>
      </CardHeader>
      <CardContent>
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <span>Generating AI report from lease data...</span>
          </div>
        ) : content ? (
          <div className="prose prose-invert prose-sm max-w-none prose-headings:text-amber-200 prose-strong:text-white prose-table:border-border prose-th:border-border prose-td:border-border">
            <Streamdown>{content}</Streamdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 opacity-50" />
            <span>Choose a lease or All Leases and generate the report for this tab.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
