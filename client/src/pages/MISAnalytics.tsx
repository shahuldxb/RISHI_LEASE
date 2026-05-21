/**
 * VodaLease Enterprise — MIS Analytics
 * Screen ID: VFMISANALY0001P001
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Sparkles, Send, Database, TrendingUp, Activity } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";

const fmtM = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const MOCK_CASHFLOW = [
  { month: "May-25",  principal: 820000, interest: 380000, total: 1200000 },
  { month: "Jun-25",  principal: 840000, interest: 370000, total: 1210000 },
  { month: "Jul-25",  principal: 860000, interest: 360000, total: 1220000 },
  { month: "Aug-25",  principal: 880000, interest: 350000, total: 1230000 },
  { month: "Sep-25",  principal: 900000, interest: 340000, total: 1240000 },
  { month: "Oct-25",  principal: 920000, interest: 330000, total: 1250000 },
  { month: "Nov-25",  principal: 940000, interest: 320000, total: 1260000 },
  { month: "Dec-25",  principal: 960000, interest: 310000, total: 1270000 },
  { month: "Jan-26",  principal: 980000, interest: 300000, total: 1280000 },
  { month: "Feb-26",  principal: 1000000, interest: 290000, total: 1290000 },
  { month: "Mar-26",  principal: 1020000, interest: 280000, total: 1300000 },
  { month: "Apr-26",  principal: 1040000, interest: 270000, total: 1310000 },
];

const MOCK_PORTFOLIO = [
  { month: "Nov-24", liability: 42100000, rouNbv: 38400000 },
  { month: "Dec-24", liability: 41800000, rouNbv: 37900000 },
  { month: "Jan-25", liability: 41500000, rouNbv: 37400000 },
  { month: "Feb-25", liability: 41200000, rouNbv: 36900000 },
  { month: "Mar-25", liability: 40900000, rouNbv: 36400000 },
  { month: "Apr-25", liability: 40600000, rouNbv: 35900000 },
];

export default function MISAnalytics() {
  const [nlQuery, setNlQuery]   = useState("");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [queryResult, setQueryResult] = useState<{ sql: string; explanation: string; data: any[] } | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  const { data: cashflow, isLoading: cfLoading } = trpc.mis.getCashFlowForecast.useQuery({ months: 12 });
  const { data: portfolio, isLoading: pfLoading } = trpc.mis.getPortfolioAnalytics.useQuery(undefined);

  const textToSql = trpc.genai.naturalLanguageQuery.useMutation({
    onSuccess: (result: any) => {
      setQueryResult(result as any);
      setQueryLoading(false);
    },
    onError: (e: any) => {
      toast.error(e.message);
      setQueryLoading(false);
    },
  });

  const handleQuery = () => {
    if (!nlQuery.trim()) return;
    setQueryLoading(true);
    textToSql.mutate({ question: nlQuery });
  };

  const cfData  = (cashflow as any[]) ?? MOCK_CASHFLOW;
  const pfData  = (portfolio as any[]) ?? MOCK_PORTFOLIO;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="page-header">
          <div>
            <ScreenHeader
  screenId="VFLMISALY0001P001"
  title="Anomaly Detection"
  subtitle="AI-powered anomaly detection and portfolio intelligence"

          screenType="mis_analytics"
          onAIData={(rows) => setAiRecord(rows[0] ?? null)}
        />
          </div>
        </div>

        <Tabs defaultValue="cashflow">
          <TabsList>
            <TabsTrigger value="cashflow">Cash Flow Forecast</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio Trend</TabsTrigger>
            <TabsTrigger value="genai">AI Query Panel</TabsTrigger>
          </TabsList>

          {/* Cash Flow Forecast */}
          <TabsContent value="cashflow">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  12-Month Cash Flow Forecast
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cfLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={cfData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtM(v)} />
                      <Tooltip formatter={(v: number) => fmtM(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="principal" name="Principal" stackId="a" fill="#e60000" radius={[0,0,0,0]} />
                      <Bar dataKey="interest"  name="Interest"  stackId="a" fill="#4f46e5" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Portfolio Trend */}
          <TabsContent value="portfolio">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Lease Liability vs ROU NBV Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pfLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={pfData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="liabGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#e60000" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#e60000" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="rouGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtM(v)} />
                      <Tooltip formatter={(v: number) => fmtM(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="liability" name="Lease Liability" stroke="#e60000" fill="url(#liabGrad)" strokeWidth={2} />
                      <Area type="monotone" dataKey="rouNbv"    name="ROU NBV"         stroke="#4f46e5" fill="url(#rouGrad)"  strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* GenAI Query Panel */}
          <TabsContent value="genai">
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Natural Language Query — Powered by Azure OpenAI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
                  Ask questions about the lease portfolio in plain English. The AI will convert your question to SQL, execute it, and return the results.
                </div>

                <div className="flex gap-2">
                  <Textarea
                    placeholder='e.g. "Show me all leases expiring in the next 90 days with liability over $500K" or "What is the total interest expense by asset type this year?"'
                    value={nlQuery}
                    onChange={e => setNlQuery(e.target.value)}
                    rows={3}
                    className="flex-1"
                    onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleQuery(); }}
                  />
                  <Button
                    onClick={handleQuery}
                    disabled={queryLoading || !nlQuery.trim()}
                    className="self-end gap-1.5"
                  >
                    <Send className="h-4 w-4" />
                    {queryLoading ? "Querying..." : "Run Query"}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    "Leases expiring in 90 days",
                    "Total liability by asset type",
                    "Overdue payments this month",
                    "Top 10 leases by monthly payment",
                  ].map(q => (
                    <button
                      key={q}
                      className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground border transition-colors"
                      onClick={() => setNlQuery(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {queryResult && (
                  <div className="space-y-3">
                    {/* SQL Generated */}
                    <div className="bg-muted/40 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Generated SQL</span>
                      </div>
                      <pre className="text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{queryResult.sql}</pre>
                    </div>

                    {/* Explanation */}
                    {queryResult.explanation && (
                      <div className="text-sm text-muted-foreground bg-primary/5 rounded-lg p-3 border border-primary/10">
                        <Sparkles className="inline h-3.5 w-3.5 mr-1 text-primary" />
                        {queryResult.explanation}
                      </div>
                    )}

                    {/* Results Table */}
                    {queryResult.data && queryResult.data.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 border-b">
                            <tr>
                              {Object.keys(queryResult.data[0]).map(k => (
                                <th key={k} className="text-left px-3 py-2 font-medium text-muted-foreground uppercase tracking-wide">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {queryResult.data.slice(0, 20).map((row: any, i: number) => (
                              <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                                {Object.values(row).map((v: any, j: number) => (
                                  <td key={j} className="px-3 py-2 tabular-nums">{String(v ?? "—")}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {queryResult.data.length > 20 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                            Showing 20 of {queryResult.data.length} rows
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
