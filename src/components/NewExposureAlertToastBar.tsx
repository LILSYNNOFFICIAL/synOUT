import React from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert, X } from 'lucide-react';
import {
  acknowledgeNewExposureAlert,
  dismissAllNewExposureAlerts,
  useNewExposureAlerts,
} from '../utils/newExposureAlertStore';

interface NewExposureAlertToastBarProps {
  onRemoveBrokerNow: (brokerId: string) => void;
  onOpenMonitor: () => void;
}

export const NewExposureAlertToastBar: React.FC<NewExposureAlertToastBarProps> = ({
  onRemoveBrokerNow,
  onOpenMonitor,
}) => {
  const { alertsEnabled, unacknowledgedAlerts } = useNewExposureAlerts();

  if (!alertsEnabled || unacknowledgedAlerts.length === 0) {
    return null;
  }

  const latest = unacknowledgedAlerts[0];
  const additionalCount = unacknowledgedAlerts.length - 1;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-16 z-40 w-full border-b border-rose-500/40 bg-slate-950/95 backdrop-blur-md px-4 py-2.5"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0 text-slate-200 leading-snug">
            <span className="font-bold text-rose-300 mr-1.5">New Exposure Alert:</span>
            <span className="font-semibold text-white">{latest.brokerName}</span>{' '}
            <span className="font-mono text-slate-400">({latest.brokerDomain})</span>
            <span aria-hidden="true" className="mx-1.5 text-slate-500">
              ·
            </span>
            <span className="text-slate-300">{latest.summary}</span>
            {additionalCount > 0 && (
              <span className="ml-2 font-mono text-rose-300 tabular-nums">
                (+{additionalCount} more new leak{additionalCount === 1 ? '' : 's'})
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onRemoveBrokerNow(latest.brokerId);
              acknowledgeNewExposureAlert(latest.id);
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Remove Now</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenMonitor();
            }}
            className="px-3 py-1.5 rounded-lg glass-subtle hover:bg-white/[0.08] text-slate-200 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>View Monitor</span>
            <ArrowRight className="w-3 h-3" />
          </button>

          {additionalCount > 0 ? (
            <button
              type="button"
              onClick={() => dismissAllNewExposureAlerts()}
              className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Dismiss All
            </button>
          ) : (
            <button
              type="button"
              onClick={() => acknowledgeNewExposureAlert(latest.id)}
              aria-label="Dismiss new exposure alert"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
