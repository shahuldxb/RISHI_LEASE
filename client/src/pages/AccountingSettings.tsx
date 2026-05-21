import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ScreenHeader from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Calendar, Settings2, Save, RefreshCw, Info } from "lucide-react";

const SCREEN_ID = "VFACCSETT0001P001";

export default function AccountingSettings() {
  const { data: settings, isLoading, refetch } = trpc.journalVoucher.getSettings.useQuery();

  const [periodDate, setPeriodDate] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [edited, setEdited] = useState(false);

  // Sync from server when loaded
  if (settings && !edited) {
    if (settings.accounting_period_date && !periodDate) setPeriodDate(settings.accounting_period_date);
    if (settings.default_currency && !currency) setCurrency(settings.default_currency);
  }

  const utils = trpc.useUtils();
  const updateMut = trpc.journalVoucher.updateSetting.useMutation({
    onSuccess: () => {
      toast.success("Setting saved");
      utils.journalVoucher.getSettings.invalidate();
      setEdited(false);
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });

  function savePeriodDate() {
    if (!periodDate) return;
    updateMut.mutate({ setting_key: "accounting_period_date", setting_value: periodDate });
  }

  function saveCurrency() {
    if (!currency) return;
    updateMut.mutate({ setting_key: "default_currency", setting_value: currency });
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full bg-gray-950 text-gray-100">
        <ScreenHeader
          screenId={SCREEN_ID}
          title="Accounting Settings"
          subtitle="Configure accounting period, currency, and IFRS 16 parameters"
          screenType="accounting_settings"
          onAIData={() => {}}
        />

        <div className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl">
          {isLoading ? (
            <div className="text-gray-500 text-sm">Loading settings...</div>
          ) : (
            <div className="space-y-6">

              {/* Accounting Period Date */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-gray-200">Current Accounting Period Date</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  This date is used as the reference for generating monthly IFRS 16 journal vouchers.
                  Set it to the last day of the period you want to process (e.g., 2026-04-30 for April 2026).
                  Since you cannot wait a real month, advance this date to generate entries for any period.
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    type="date"
                    value={periodDate}
                    onChange={e => { setPeriodDate(e.target.value); setEdited(true); }}
                    className="bg-gray-800 border-gray-700 text-gray-100 h-9 w-48"
                  />
                  <Button
                    size="sm"
                    className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={savePeriodDate}
                    disabled={updateMut.isPending || !periodDate}
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-gray-700 text-gray-400 hover:bg-gray-800"
                    onClick={() => { const today = new Date().toISOString().slice(0, 10); setPeriodDate(today); setEdited(true); }}
                  >
                    Set Today
                  </Button>
                </div>
                <div className="mt-3 flex items-start gap-2 bg-blue-900/20 border border-blue-800/30 rounded px-3 py-2 text-xs text-blue-300">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>How to use:</strong> Go to Journal Voucher → Click "Generate Monthly" → The year and month will be pre-filled from this date.
                    Change this date to generate entries for past or future periods without waiting.
                  </span>
                </div>
              </div>

              {/* Default Currency */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Settings2 className="w-4 h-4 text-green-400" />
                  <h3 className="text-sm font-semibold text-gray-200">Default Currency</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Default currency for journal vouchers and accounting entries.
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    value={currency}
                    onChange={e => { setCurrency(e.target.value.toUpperCase()); setEdited(true); }}
                    placeholder="e.g. QAR"
                    className="bg-gray-800 border-gray-700 text-gray-100 h-9 w-32"
                    maxLength={10}
                  />
                  <Button
                    size="sm"
                    className="h-9 bg-green-600 hover:bg-green-700 text-white"
                    onClick={saveCurrency}
                    disabled={updateMut.isPending || !currency}
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    Save
                  </Button>
                </div>
              </div>

              {/* Current Values */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-200">All Settings</h3>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500 hover:text-gray-300" onClick={() => refetch()}>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh
                  </Button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-2 text-gray-500 font-medium">Setting Key</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(settings ?? {}).map(([k, v]) => (
                      <tr key={k} className="border-b border-gray-800/50">
                        <td className="py-2 font-mono text-blue-300">{k}</td>
                        <td className="py-2 text-gray-200">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
