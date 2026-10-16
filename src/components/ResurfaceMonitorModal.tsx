import React, { useState } from 'react';
import { DATA_BROKERS } from '../data/brokers';
import { ScanResult } from '../types';
import { X, RefreshCw, AlertTriangle, ShieldCheck, Bell, Calendar, Clock, CheckCircle } from 'lucide-react';

interface ResurfaceMonitorModalProps {
  results: ScanResult[];
  onTriggerResurfaceCheck: (resurfacedBrokerIds: string[]) => void;
  onClose: () => void;
}

export const ResurfaceMonitorModal: React.FC<ResurfaceMonitorModalProps> = ({
  results,
  onTriggerResurfaceCheck,
  onClose,
}) => {
  const [scheduleDays, setScheduleDays] = useState<'30' | '60' | '90'>('30');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);
  const [resurfacedList, setResurfacedList] = useState<string[]>([]);

  const handleSimulateResurface = () => {
    setIsSimulating(true);
    setSimulationComplete(false);

    // Pick 2-3 brokers from previously removed or exposed list to simulate resurfacing
    setTimeout(() => {
      const candidates = results.filter((r) => r.status === 'exposed');
      const picked = candidates.slice(0, 3).map((c) => c.brokerId);
      setResurfacedList(picked);
      setIsSimulating(false);
      setSimulationComplete(true);
      onTriggerResurfaceCheck(picked);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-8">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Continuous Resurface Defense & Re-Audit</h3>
              <p className="text-xs text-slate-400">
                Automated continuous surveillance against data brokers repopulating your records
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Explanation Banner */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Why do data brokers resurface deleted records?</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Data brokers constantly purchase updated voter rolls, property deed filings, utility connections, and commercial marketing registries. Even after honorably deleting your profile, their automated crawlers often re-index you every 30 to 90 days.
            </p>
          </div>

          {/* Schedule Configuration */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>Recurring Re-Audit Schedule</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(['30', '60', '90'] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setScheduleDays(days)}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    scheduleDays === days
                      ? 'bg-emerald-500/10 border-emerald-500 text-white font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-base font-mono">{days} Days</div>
                  <div className="text-[11px] text-slate-500">
                    {days === '30' ? 'Recommended' : days === '60' ? 'Standard' : 'Extended'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Resurface Alert Notifications</div>
                <div className="text-[11px] text-slate-400">Receive in-app & email alerts when a purged broker re-indexes your name</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEmailAlerts(!emailAlerts)}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                emailAlerts ? 'bg-emerald-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                  emailAlerts ? 'left-6' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Simulation Section */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Test Continuous Resurface Engine:</span>
              <button
                type="button"
                onClick={handleSimulateResurface}
                disabled={isSimulating}
                className="px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                <span>{isSimulating ? 'Scanning Registries...' : 'Simulate 60-Day Re-Check'}</span>
              </button>
            </div>

            {simulationComplete && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-rose-300 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Resurface Detected: {resurfacedList.length} Brokers Re-Indexed You</span>
                  </span>
                  <span className="text-[11px] font-mono text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded">
                    Action Required
                  </span>
                </div>
                <div className="text-slate-300">
                  {resurfacedList
                    .map((id) => DATA_BROKERS.find((b) => b.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}{' '}
                  repopulated unredacted phone & address records from municipal county deeds.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Next automated sweep scheduled in {scheduleDays} days.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
