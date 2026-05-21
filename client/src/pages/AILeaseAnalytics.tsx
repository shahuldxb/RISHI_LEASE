import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Send, Sparkles, TrendingUp, AlertTriangle, BarChart3, Lightbulb, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const SUGGESTED_QUERIES = [
  "Which leases are expiring in the next 6 months and what is the total liability exposure?",
  "Show me the top 5 leases by ROU asset value and their current IBR rates",
  "What is our total lease liability by entity and currency?",
  "Which leases have renewal options and when do they need to be exercised?",
  "Compare our lease costs this year vs last year by asset category",
  "What is the impact on our balance sheet if IBR increases by 100 basis points?",
  "List all leases with missing critical data fields",
  "Which properties have the highest cost per square metre?",
];

const SAMPLE_INSIGHTS = [
  { type: "RISK", title: "High Concentration Risk", description: "47% of total lease liability is concentrated in 3 lessors (Al Futtaim, Emaar, TECOM). Consider diversifying counterparty exposure.", severity: "HIGH", action: "Review Lessors" },
  { type: "OPPORTUNITY", title: "Renewal Negotiation Window", description: "8 leases totalling QAR 12.4M annual rent have renewal options expiring within 90 days. Current market rates are 8-12% below contract rates.", severity: "MEDIUM", action: "View Renewals" },
  { type: "COMPLIANCE", title: "IBR Update Required", description: "15 leases have IBR rates older than 12 months. IFRS 16 requires reassessment at each reporting date for variable-rate leases.", severity: "HIGH", action: "Update IBR" },
  { type: "SAVINGS", title: "Short-Term Exemption Candidates", description: "6 leases with remaining terms < 12 months qualify for short-term lease exemption, potentially removing QAR 3.2M from the balance sheet.", severity: "LOW", action: "Review Leases" },
  { type: "RISK", title: "FX Exposure Unhedged", description: "3 USD-denominated leases totalling USD 1.8M are currently unhedged. Current QAR/USD rate movement of ±5% would impact liability by ±QAR 330K.", severity: "MEDIUM", action: "Hedge Review" },
];

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-500/20 text-red-400 border-red-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-green-500/20 text-green-400 border-green-500/30",
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  RISK: AlertTriangle,
  OPPORTUNITY: TrendingUp,
  COMPLIANCE: AlertTriangle,
  SAVINGS: Lightbulb,
};

type Message = { role: "user" | "assistant"; content: string; timestamp: string };

const CANNED_RESPONSES: Record<string, string> = {
  default: `Based on your lease portfolio data, here is the analysis:\n\n**Portfolio Summary:**\n- Total active leases: 94 across 4 entities\n- Total ROU Assets: QAR 236.6M\n- Total Lease Liabilities: QAR 224.0M\n- Weighted average IBR: 4.82%\n\nWould you like me to drill down into any specific area — entity, asset category, or time period?`,
  expir: `**Leases Expiring in Next 6 Months:**\n\n| Contract Ref | Lessor | Monthly Rent | Expiry Date | Liability |\n|---|---|---|---|---|\n| VF-2024-018 | Al Futtaim | QAR 125,000 | 2026-07-31 | QAR 2.1M |\n| VF-2023-041 | TECOM | QAR 87,500 | 2026-08-15 | QAR 1.4M |\n| VF-2024-003 | Emaar | QAR 210,000 | 2026-09-30 | QAR 3.8M |\n| VF-2022-019 | Nakheel | QAR 65,000 | 2026-10-01 | QAR 0.9M |\n\n**Total Liability Exposure: QAR 8.2M**\n\nRecommendation: Initiate renewal negotiations for VF-2024-003 (Emaar) immediately given the 5-month lead time required.`,
  liab: `**Total Lease Liability by Entity & Currency:**\n\n| Entity | QAR | USD | GBP | Total (QAR) |\n|---|---|---|---|---|\n| VF-Qatar | 142.3M | 8.8M | — | 174.6M |\n| VF-DXB | 55.1M | — | — | 55.1M |\n| VF-AUH | 32.8M | — | — | 32.8M |\n| VF-SHJ | 17.2M | — | — | 17.2M |\n\n**Group Total: QAR 279.7M** (before intercompany elimination of QAR 13.3M)\n**Consolidated: QAR 266.4M**`,
  ibr: `**IBR Sensitivity Analysis (+100bps):**\n\nA 100 basis point increase in the Incremental Borrowing Rate would have the following impact:\n\n- **ROU Asset decrease:** QAR 8.4M (3.6%)\n- **Lease Liability decrease:** QAR 9.1M (4.1%)\n- **Net P&L impact:** QAR 0.7M gain (remeasurement)\n- **Interest expense increase (annual):** QAR 2.2M\n\nThe net balance sheet impact is a reduction in both assets and liabilities, with a modest P&L gain from the remeasurement. However, future interest expense increases by approximately QAR 2.2M per annum.`,
};

export default function AILeaseAnalytics() {
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Action completed successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const [tab, setTab] = useState("chat");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm your VodaLease AI assistant. I can answer questions about your lease portfolio, run analyses, identify risks, and generate insights. What would you like to know?", timestamp: new Date().toLocaleTimeString() },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function getResponse(query: string): string {
    const q = query.toLowerCase();
    if (q.includes("expir") || q.includes("6 month")) return CANNED_RESPONSES.expir;
    if (q.includes("liab") || q.includes("entity") || q.includes("currency")) return CANNED_RESPONSES.liab;
    if (q.includes("ibr") || q.includes("basis point") || q.includes("interest rate")) return CANNED_RESPONSES.ibr;
    return CANNED_RESPONSES.default;
  }

  async function sendMessage(text?: string) {
    const query = text || input.trim();
    if (!query) return;
    setInput("");
    const userMsg: Message = { role: "user", content: query, timestamp: new Date().toLocaleTimeString() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    const response = getResponse(query);
    setMessages(prev => [...prev, { role: "assistant", content: response, timestamp: new Date().toLocaleTimeString() }]);
    setIsLoading(false);
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <ScreenHeader
  screenId="VFLAIALY0001P001"
  title="AI Lease Analytics"
  subtitle="Natural language insights and predictive analytics"

          screenType="ai_lease_analytics"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted/30">
            <TabsTrigger value="chat">Natural Language Query</TabsTrigger>
            <TabsTrigger value="insights">AI Insights</TabsTrigger>
            <TabsTrigger value="predictions">Predictive Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3">
                <Card className="bg-card border-border h-[520px] flex flex-col">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Brain className="w-4 h-4 text-purple-400" /> VodaLease AI Assistant
                      <Badge className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 ml-auto">Online</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-[#e60000] text-white" : "bg-muted/30 border border-border"}`}>
                          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{msg.content}</pre>
                          <p className={`text-xs mt-1 ${msg.role === "user" ? "text-white/70" : "text-muted-foreground"}`}>{msg.timestamp}</p>
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted/30 border border-border rounded-xl px-4 py-3">
                          <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" />
                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0.15s" }} />
                            <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0.3s" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </CardContent>
                  <div className="p-4 border-t border-border">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ask anything about your lease portfolio..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                        disabled={isLoading}
                        className="flex-1"
                      />
                      <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white" onClick={() => sendMessage()} disabled={isLoading || !input.trim()}>
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested Queries</p>
                {SUGGESTED_QUERIES.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)}
                    className="w-full text-left text-xs p-2.5 rounded-lg border border-border bg-muted/10 hover:bg-muted/30 hover:border-[#e60000]/30 transition-all leading-relaxed">
                    <Sparkles className="w-3 h-3 text-purple-400 inline mr-1.5" />{q}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="mt-4">
            <div className="flex justify-end mb-4">
              <Button variant="outline" onClick={() => toast.info("Refreshing AI insights...")} className="text-xs">
                <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh Insights
              </Button>
            </div>
            <div className="space-y-3">
              {SAMPLE_INSIGHTS.map((insight, i) => {
                const Icon = TYPE_ICONS[insight.type] || Lightbulb;
                return (
                  <Card key={i} className="bg-card border-border">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${insight.severity === "HIGH" ? "bg-red-500/10" : insight.severity === "MEDIUM" ? "bg-yellow-500/10" : "bg-green-500/10"}`}>
                          <Icon className={`w-5 h-5 ${insight.severity === "HIGH" ? "text-red-400" : insight.severity === "MEDIUM" ? "text-yellow-400" : "text-green-400"}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold">{insight.title}</p>
                            <Badge className={`text-xs border ${SEVERITY_COLORS[insight.severity]}`}>{insight.severity}</Badge>
                            <Badge className="text-xs bg-muted/30 text-muted-foreground border border-border">{insight.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{insight.description}</p>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={() => toast.info(`${insight.action} — navigating...`)}>
                          {insight.action}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="predictions" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="w-4 h-4 text-blue-400" /> Lease Liability Forecast (12 months)</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {["Apr 26", "Jun 26", "Sep 26", "Dec 26"].map((period, i) => {
                      const values = [224000000, 218500000, 211200000, 203800000];
                      const pct = Math.round((values[i] / 224000000) * 100);
                      return (
                        <div key={period} className="flex items-center gap-3">
                          <span className="text-xs w-12 text-muted-foreground">{period}</span>
                          <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                            <div className="h-full bg-blue-500/70 rounded" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-mono w-16 text-right">QAR {(values[i] / 1000000).toFixed(0)}M</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">Forecast assumes no new leases and scheduled principal repayments at current IBR rates.</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><BarChart3 className="w-4 h-4 text-green-400" /> Renewal Probability Scoring</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { ref: "VF-2024-003", lessor: "Emaar Properties", probability: 87, reason: "Strategic location, below-market rent" },
                      { ref: "VF-2024-018", lessor: "Al Futtaim", probability: 72, reason: "Operational dependency, limited alternatives" },
                      { ref: "VF-2023-041", lessor: "TECOM", probability: 45, reason: "Market alternatives available, lease above market" },
                      { ref: "VF-2022-019", lessor: "Nakheel", probability: 31, reason: "Consolidation candidate, redundant location" },
                    ].map((item, i) => (
                      <div key={i} className="p-3 rounded-lg border border-border bg-muted/10">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-semibold">{item.ref}</span>
                          <span className={`text-xs font-bold ${item.probability >= 70 ? "text-green-400" : item.probability >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                            {item.probability}% renewal probability
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.lessor} — {item.reason}</p>
                        <div className="h-1.5 bg-muted/30 rounded mt-2 overflow-hidden">
                          <div className={`h-full rounded ${item.probability >= 70 ? "bg-green-500" : item.probability >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${item.probability}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
