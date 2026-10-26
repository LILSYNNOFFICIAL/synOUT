import React, { useState, useEffect, useCallback, useRef } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [logoLoadError, setLogoLoadError] = useState(false);
  const finishedRef = useRef(false);

  const handleFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsFadingOut(true);
    setTimeout(() => {
      onComplete();
    }, 300);
  }, [onComplete]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const timer = setTimeout(
      () => {
        handleFinish();
      },
      prefersReducedMotion ? 500 : 1420
    );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        handleFinish();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleFinish]);

  return (
    <div
      data-testid="synout-splash-screen"
      onClick={handleFinish}
      role="status"
      aria-label="Loading synOUT workspace"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#040B1A] text-white select-none overflow-hidden transition-opacity duration-300 cursor-pointer ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Ambient Brand Aura Matching synOUT Blue-Cyan Palette */}
      <div
        aria-hidden="true"
        className="absolute w-[520px] h-[320px] rounded-full bg-sky-500/12 blur-[120px] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute w-[360px] h-[240px] rounded-full bg-blue-600/10 blur-[100px] -translate-x-24 translate-y-8 pointer-events-none"
      />

      {/* Minimalist Frosted Glass Brand Stage */}
      <div className="relative z-10 flex flex-col items-center px-8 py-10 sm:px-14 sm:py-12 rounded-3xl glass-panel border-white/[0.09] max-w-lg w-[calc(100%-2rem)] text-center space-y-6 overflow-hidden">
        {/* Specular Glass Sheen Sweep */}
        <div
          aria-hidden="true"
          className="synout-splash-sheen pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent opacity-0"
        />

        {/* Animated synOUT Brand Logo */}
        <div className="synout-splash-logo relative flex items-center justify-center">
          {!logoLoadError ? (
            <img
              src="/synout-logo.svg"
              alt="synOUT"
              referrerPolicy="no-referrer"
              onError={() => setLogoLoadError(true)}
              className="w-60 sm:w-76 h-auto object-contain drop-shadow-[0_0_28px_rgba(14,196,255,0.22)]"
            />
          ) : (
            <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
              syn<span className="text-sky-400">OUT</span>
            </span>
          )}
        </div>

        {/* Minimalist Natural-Prose Brand Subtitle */}
        <p className="text-xs sm:text-sm text-slate-400 tracking-wide">
          Autonomous Personal Data Suppression &amp; Privacy Defense
        </p>

        {/* Hairline GPU-Composited Brand Progress Strip */}
        <div className="w-44 sm:w-52 h-[2px] rounded-full bg-white/[0.08] overflow-hidden">
          <div className="synout-splash-progress h-full w-full origin-left bg-gradient-to-r from-[#0C6FFF] via-[#00C0FF] to-[#14E4FF]" />
        </div>
      </div>
    </div>
  );
};
