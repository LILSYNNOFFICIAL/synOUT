import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Install synOUT on your desktop or phone for instant offline compliance & vault access"
        className={
          compact
            ? 'inline-flex items-center gap-1 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer text-slate-300'
            : 'px-3 py-1.5 rounded-xl glass-subtle hover:border-emerald-400/40 text-xs font-semibold text-emerald-300 hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0'
        }
      >
        <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>{isIOS ? 'Install on iOS' : 'Install App'}</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="glass-popover rounded-2xl max-w-md w-full p-6 space-y-4 border border-white/[0.08]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl glass-subtle flex items-center justify-center text-emerald-400 shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isIOS ? 'Install synOUT on iPhone / iPad' : 'Install synOUT Desktop & Mobile App'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Offline SLA Tracker &amp; Encrypted Vault Access
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install guide"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-xs text-slate-300 list-decimal list-inside glass-subtle rounded-xl p-4 leading-relaxed">
                <li>
                  Tap the <strong className="text-white">Share</strong> icon in your Safari toolbar.
                </li>
                <li>
                  Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-emerald-300">Add</strong> to launch synOUT as a full-screen standalone app.
                </li>
              </ol>
            ) : (
              <div className="space-y-3 text-xs text-slate-300 glass-subtle rounded-xl p-4 leading-relaxed">
                <p>
                  Open synOUT in a standalone browser tab (if currently inside a preview frame) and click the{' '}
                  <strong className="text-white">Install synOUT</strong> icon on the right side of your Chrome, Edge, or Brave address bar.
                </p>
                <div className="flex items-center gap-2 text-emerald-300 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Caches your 45-Day SLA Tracker &amp; Encrypted Vault for offline inspection.</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
