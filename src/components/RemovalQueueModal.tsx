import React, { useState } from 'react';
import { DATA_BROKERS } from '../data/brokers';
import { ScanResult } from '../types';
import { X, Send, Sparkles, CheckCircle2, RotateCcw } from 'lucide-react';

interface RemovalQueueModalProps {
  queue: ScanResult[];
  onClose: () => void;
  onComplete: (updatedResults: ScanResult[]) => void;
}

export const RemovalQueueModal: React.FC<RemovalQueueModalProps> = ({
  queue,
  onClose,
  onComplete,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleStartBatch = () => {
    setIsProcessing(true);
    let current = 0;
    const interval = setInterval(() => {
      current++;
      setProgress(Math.round((current / queue.length) * 100));

      if (current >= queue.length) {
        clearInterval(interval);
        const updated: ScanResult[] = queue.map((r) => ({
          ...r,
          removalStatus: 'submitted',
          optOutConfirmationCode: `BAT-${Math.floor(1000 + Math.random() * 9000)}-SYN`,
          submissionDate: new Date().toLocaleDateString(),
        }));
        setTimeout(() => {
          onComplete(updated);
          onClose();
        }, 500);
      }
    }, 60);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white">Batch Statutory Opt-Out Dispatch</h2>
            <p className="text-xs text-slate-400">Queue contains {queue.length} confirmed exposed broker records</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>Dispatch Progress</span>
            <span className="text-white font-bold">{progress}%</span>
          </div>

          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-400 space-y-2">
          <p>
            This action delivers authenticated CCPA & state statutory data suppression payloads to all {queue.length} data brokers simultaneously.
          </p>
          <p className="text-[11px] text-slate-500">
            Records transition to "Submitted (Awaiting Statutory Expungement)" state with official 15-45 day response timelines.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={onClose} disabled={isProcessing} className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleStartBatch}
            disabled={isProcessing}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
          >
            {isProcessing ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isProcessing ? 'Dispatching Payloads...' : `Execute All ${queue.length} Demands`}
          </button>
        </div>
      </div>
    </div>
  );
};
