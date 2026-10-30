import React from 'react';
import { ArrowRight, Flame, Inbox, Scale, Bot, Network, Lock, Command } from 'lucide-react';
import { getExhaustiveBrokerRegistry } from '../utils/dynamicBrokerRegistry';
import { listAllBrokerPlaybooks } from '../utils/brokerAdapterCatalog';

interface HeroSectionProps {
  onStartScan: () => void;
  onExploreBrokers: () => void;
  hasScanResults?: boolean;
  onNukeAll?: () => void;
  onOpenWebForms?: () => void;
  onOpenInboxHarvester?: () => void;
  onOpenStateRegistries?: () => void;
  onOpenSupplyChain?: () => void;
  onOpenCreditFreeze?: () => void;
  onOpenCommandPalette?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onStartScan,
  onExploreBrokers,
  hasScanResults = false,
  onNukeAll,
  onOpenWebForms,
  onOpenInboxHarvester,
  onOpenStateRegistries,
  onOpenSupplyChain,
  onOpenCreditFreeze,
  onOpenCommandPalette,
}) => {
  const verifiedBrokerCount = getExhaustiveBrokerRegistry().length;
  const playbookCount = listAllBrokerPlaybooks().length;

  return (
    <section className="relative pt-12 pb-8 sm:pt-16 sm:pb-12 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="glass-panel rounded-3xl p-8 sm:p-12 lg:p-14 text-center space-y-8">
          {/* Unboxed Minimalist Metadata Line */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400 tabular-nums">
            <span className="text-emerald-400 font-medium">Automatic Web Forms &amp; Legal Emails</span>
            <span aria-hidden="true">·</span>
            <span>{playbookCount} Guided Broker Playbooks</span>
            <span aria-hidden="true">·</span>
            <span>Checks Required Consent Boxes For You</span>
            <span aria-hidden="true">·</span>
            <span>CA, TX, OR &amp; VT Privacy Laws</span>
          </div>

          {/* Display Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1] [text-wrap:balance] max-w-4xl mx-auto">
            Remove Your Personal Records{' '}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
              Automatically — Forms &amp; Email
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-slate-300/90 max-w-2xl mx-auto leading-relaxed">
            See which data brokers publish your name, address, and phone number — then let synOUT
            remove them on your behalf. We fill out online opt-out forms (including checking
            required consent boxes for you) and send official legal removal emails in minutes.
          </p>

          {/* Primary Action Row */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3.5 pt-1">
            <button
              type="button"
              onClick={onStartScan}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-colors shadow-lg shadow-emerald-500/15 inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>Start Exposure Audit</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {hasScanResults && onNukeAll && (
              <button
                type="button"
                onClick={onNukeAll}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white border border-red-400/30 font-bold text-sm transition-colors shadow-lg shadow-red-600/20 inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Flame className="w-4 h-4" />
                <span>NUKE ALL Brokers</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExploreBrokers}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl glass-subtle hover:border-white/20 text-slate-200 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap tabular-nums"
            >
              Browse {verifiedBrokerCount} Brokers
            </button>

            {onOpenCommandPalette && (
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="w-full sm:w-auto px-5 py-3.5 rounded-2xl glass-subtle hover:border-white/20 text-slate-300 hover:text-white text-sm font-medium transition-colors inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Command className="w-4 h-4 text-emerald-400" />
                <span>Quick Jump (⌘K)</span>
              </button>
            )}
          </div>

          {/* Minimalist 3-Compartment Quick Launch Strip */}
          <div className="pt-6 border-t border-white/[0.07] grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            <button
              type="button"
              onClick={onOpenWebForms || onExploreBrokers}
              className="glass-card rounded-2xl p-4 space-y-1 cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-white">
                <span>Automatic Web-Form Removal</span>
                <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Opens broker forms, fills your details, checks required privacy boxes for you, and submits.
              </p>
            </button>

            <button
              type="button"
              onClick={onOpenInboxHarvester || onStartScan}
              className="glass-card rounded-2xl p-4 space-y-1 cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-white">
                <span>1-Click Email Confirmation Helper</span>
                <Inbox className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Finds confirmation links brokers email back to you and finishes the final click safely.
              </p>
            </button>

            <button
              type="button"
              onClick={onOpenStateRegistries || onExploreBrokers}
              className="glass-card rounded-2xl p-4 space-y-1 cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-white">
                <span>State Privacy Law Protection</span>
                <Scale className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Syncs official CA, TX, OR &amp; VT broker registries and builds ready-to-send complaint packets.
              </p>
            </button>

            {onOpenSupplyChain && (
              <button
                type="button"
                onClick={onOpenSupplyChain}
                className="glass-card rounded-2xl p-4 space-y-1 cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-white">
                  <span>Upstream Supply-Chain Graph</span>
                  <Network className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Maps wholesale clearinghouses feeding downstream people-search sites so deleted records stay gone.
                </p>
              </button>
            )}

            {onOpenCreditFreeze && (
              <button
                type="button"
                onClick={onOpenCreditFreeze}
                className="glass-card rounded-2xl p-4 space-y-1 cursor-pointer sm:col-span-2"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-white">
                  <span>FCRA § 605A Credit Freeze, Fraud Alert &amp; Identity Lockout Center</span>
                  <Lock className="w-4 h-4 text-sky-400 shrink-0" />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Track free federal freezes across Equifax, Experian, TransUnion, Innovis, ChexSystems, NCTUE, IRS IP PIN &amp; DHS E-Verify.
                </p>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
