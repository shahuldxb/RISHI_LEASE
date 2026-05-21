import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Database, AlertTriangle, TrendingUp, RefreshCw, CheckCircle, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { ScreenHeader } from '@/components/ScreenHeader';

const SCREEN_ID = 'VFRSYSPERF001P001';

export default function PerformanceMonitor() {
  const [daysBack, setDaysBack] = useState(7);

  const slowQueries = trpc.performance.getSlowQueries.useQuery({ daysBack, topN: 100 });
  const stats = trpc.performance.getSlowQueryStats.useQuery({ daysBack });
  const indexRecs = trpc.performance.getIndexRecommendations.useQuery({ topN: 20 });
  const realtimeStats = trpc.performance.getRealtimeStats.useQuery(undefined, { refetchInterval: 10000 });
  const poolStatus = trpc.performance.getPoolStatus.useQuery(undefined, { refetchInterval: 5000 });

  const resolveMutation = trpc.performance.resolveSlowQuery.useMutation({
    onSuccess: () => { slowQueries.refetch(); stats.refetch(); },
  });
  const purgeMutation = trpc.performance.purgeOldRecords.useMutation({
    onSuccess: () => { slowQueries.refetch(); stats.refetch(); },
  });
  const applyIndexMutation = trpc.performance.applyIndex.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || 'Index created successfully');
      indexRecs.refetch();
    },
    onError: (err) => {
      toast.error(`Failed to apply index: ${err.message}`);
    },
  });

  const summary = stats.data?.summary;
  const byProcedure = stats.data?.byProcedure || [];

  return (
    <DashboardLayout>
      <ScreenHeader screenId={SCREEN_ID} title="Database Performance Monitor" subtitle="Query timing, slow query log, and index recommendations" />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Database className="h-4 w-4" /> Pool Status
            </div>
            <div className="text-2xl font-bold">
              {poolStatus.data?.connected ? (
                <span className="text-green-500">Connected</span>
              ) : (
                <span className="text-red-500">Disconnected</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Max: 30 | Min: 5
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Activity className="h-4 w-4" /> Queries Executed
            </div>
            <div className="text-2xl font-bold">{realtimeStats.data?.totalExecuted ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Since server start
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Slow Queries
            </div>
            <div className="text-2xl font-bold text-amber-500">{summary?.total_slow_queries ?? realtimeStats.data?.totalSlow ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Last {daysBack} days (&gt;500ms)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="h-4 w-4" /> Avg Duration
            </div>
            <div className="text-2xl font-bold">{summary?.overall_avg_ms ?? 0}ms</div>
            <div className="text-xs text-muted-foreground mt-1">
              Max: {summary?.overall_max_ms ?? 0}ms
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" /> Resolved
            </div>
            <div className="text-2xl font-bold text-green-500">{summary?.resolved_count ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Unresolved: {summary?.unresolved_count ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Time range:</span>
        {[1, 3, 7, 14, 30].map(d => (
          <Button key={d} variant={daysBack === d ? 'default' : 'outline'} size="sm" onClick={() => setDaysBack(d)}>
            {d}d
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { slowQueries.refetch(); stats.refetch(); realtimeStats.refetch(); }}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={() => purgeMutation.mutate({ retentionDays: 90 })}>
            <Trash2 className="h-3 w-3 mr-1" /> Purge &gt;90d
          </Button>
        </div>
      </div>

      <Tabs defaultValue="slow-queries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="slow-queries">Slow Queries</TabsTrigger>
          <TabsTrigger value="by-procedure">By Procedure</TabsTrigger>
          <TabsTrigger value="realtime">Real-time Stats</TabsTrigger>
          <TabsTrigger value="indexes">Index Recommendations</TabsTrigger>
        </TabsList>

        {/* Slow Queries Tab */}
        <TabsContent value="slow-queries">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Slow Queries (&gt;500ms)</CardTitle>
            </CardHeader>
            <CardContent>
              {slowQueries.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (slowQueries.data?.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No slow queries recorded in the last {daysBack} days</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Procedure</th>
                        <th className="p-2">Duration</th>
                        <th className="p-2">Rows</th>
                        <th className="p-2">Executed At</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(slowQueries.data || []).map((q: any) => (
                        <tr key={q.id} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-mono text-xs">{q.procedure_name}</td>
                          <td className="p-2">
                            <Badge variant={q.duration_ms > 2000 ? 'destructive' : q.duration_ms > 1000 ? 'default' : 'secondary'}>
                              {q.duration_ms}ms
                            </Badge>
                          </td>
                          <td className="p-2">{q.row_count ?? '-'}</td>
                          <td className="p-2 text-xs">{new Date(q.executed_at).toLocaleString()}</td>
                          <td className="p-2">
                            {q.resolved ? (
                              <Badge variant="outline" className="text-green-500 border-green-500">Resolved</Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-500 border-amber-500">Open</Badge>
                            )}
                          </td>
                          <td className="p-2">
                            {!q.resolved && (
                              <Button size="sm" variant="ghost" onClick={() => resolveMutation.mutate({ slowQueryId: q.id, notes: 'Marked resolved from UI' })}>
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Procedure Tab */}
        <TabsContent value="by-procedure">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Slow Query Frequency by Stored Procedure</CardTitle>
            </CardHeader>
            <CardContent>
              {byProcedure.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Procedure</th>
                        <th className="p-2">Occurrences</th>
                        <th className="p-2">Avg (ms)</th>
                        <th className="p-2">Max (ms)</th>
                        <th className="p-2">Min (ms)</th>
                        <th className="p-2">Errors</th>
                        <th className="p-2">Last Seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byProcedure.map((row: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-mono text-xs">{row.procedure_name}</td>
                          <td className="p-2 font-bold">{row.occurrence_count}</td>
                          <td className="p-2">
                            <Badge variant={row.avg_duration_ms > 2000 ? 'destructive' : 'secondary'}>
                              {row.avg_duration_ms}ms
                            </Badge>
                          </td>
                          <td className="p-2">{row.max_duration_ms}ms</td>
                          <td className="p-2">{row.min_duration_ms}ms</td>
                          <td className="p-2">{row.error_count > 0 ? <span className="text-red-500">{row.error_count}</span> : '0'}</td>
                          <td className="p-2 text-xs">{new Date(row.last_occurred).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Real-time Stats Tab */}
        <TabsContent value="realtime">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">In-Memory Query Stats (Since Server Start)</CardTitle>
            </CardHeader>
            <CardContent>
              {!realtimeStats.data?.stats?.length ? (
                <div className="text-center py-8 text-muted-foreground">No queries executed yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Procedure</th>
                        <th className="p-2">Calls</th>
                        <th className="p-2">Avg (ms)</th>
                        <th className="p-2">Max (ms)</th>
                        <th className="p-2">Min (ms)</th>
                        <th className="p-2">Slow Count</th>
                        <th className="p-2">Last Called</th>
                      </tr>
                    </thead>
                    <tbody>
                      {realtimeStats.data.stats.map((stat: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-mono text-xs">{stat.procedureName}</td>
                          <td className="p-2">{stat.callCount}</td>
                          <td className="p-2">
                            <Badge variant={stat.avgDurationMs > 500 ? 'destructive' : stat.avgDurationMs > 200 ? 'default' : 'secondary'}>
                              {stat.avgDurationMs}ms
                            </Badge>
                          </td>
                          <td className="p-2">{stat.maxDurationMs}ms</td>
                          <td className="p-2">{stat.minDurationMs}ms</td>
                          <td className="p-2">
                            {stat.slowCount > 0 ? <span className="text-amber-500 font-bold">{stat.slowCount}</span> : '0'}
                          </td>
                          <td className="p-2 text-xs">{new Date(stat.lastCalledAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cache Stats Card */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Server-Side Query Cache</CardTitle>
            </CardHeader>
            <CardContent>
              {realtimeStats.data?.cache ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-500">{realtimeStats.data.cache.hits}</div>
                      <div className="text-xs text-muted-foreground">Cache Hits</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-amber-500">{realtimeStats.data.cache.misses}</div>
                      <div className="text-xs text-muted-foreground">Cache Misses</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold">{realtimeStats.data.cache.hitRate}</div>
                      <div className="text-xs text-muted-foreground">Hit Rate</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold">{realtimeStats.data.cache.size}</div>
                      <div className="text-xs text-muted-foreground">Cached Entries</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-400">{realtimeStats.data.cache.evictions}</div>
                      <div className="text-xs text-muted-foreground">Evictions</div>
                    </div>
                  </div>
                  {realtimeStats.data.cache.entries?.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="p-2">Cached Query</th>
                            <th className="p-2">Hits</th>
                            <th className="p-2">TTL Remaining</th>
                          </tr>
                        </thead>
                        <tbody>
                          {realtimeStats.data.cache.entries.map((entry: any, i: number) => (
                            <tr key={i} className="border-b hover:bg-muted/50">
                              <td className="p-2 font-mono text-xs">{entry.key}</td>
                              <td className="p-2">{entry.hitCount}</td>
                              <td className="p-2">{entry.ttlRemaining}s</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">Cache not initialized</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Index Recommendations Tab */}
        <TabsContent value="indexes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SQL Server Index Recommendations (from DMVs)</CardTitle>
            </CardHeader>
            <CardContent>
              {indexRecs.isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (indexRecs.data?.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No index recommendations available. SQL Server DMVs may need more query activity to generate suggestions.</div>
              ) : (
                <div className="space-y-3">
                  {(indexRecs.data || []).map((rec: any, i: number) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{rec.table_name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="default">Impact: {Math.round(rec.avg_user_impact)}%</Badge>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 px-2 text-xs"
                            disabled={applyIndexMutation.isPending}
                            onClick={() => {
                              if (rec.create_index_statement) {
                                applyIndexMutation.mutate({ createStatement: rec.create_index_statement });
                              }
                            }}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            {applyIndexMutation.isPending ? 'Applying...' : 'Run Index'}
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>Equality: {rec.equality_columns || 'None'}</div>
                        <div>Inequality: {rec.inequality_columns || 'None'}</div>
                        <div>Include: {rec.included_columns || 'None'}</div>
                        <div>Seeks: {rec.user_seeks} | Scans: {rec.user_scans}</div>
                      </div>
                      <div className="bg-muted p-2 rounded font-mono text-xs overflow-x-auto">
                        {rec.create_index_statement}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
