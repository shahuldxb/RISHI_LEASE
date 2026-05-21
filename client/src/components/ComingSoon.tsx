import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export function ComingSoon({ title, screenId, description }: {
  title: string;
  screenId?: string;
  description?: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/20">
        <Construction className="w-10 h-10 text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {screenId && (
          <p className="text-xs text-muted-foreground mt-1 font-mono">Screen ID: {screenId}</p>
        )}
        {description && (
          <p className="text-sm text-muted-foreground mt-2 max-w-md">{description}</p>
        )}
      </div>
      <Button variant="outline" onClick={() => setLocation("/")}>Back to Dashboard</Button>
    </div>
  );
}
