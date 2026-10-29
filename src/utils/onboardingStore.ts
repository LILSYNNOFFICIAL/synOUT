import { useSyncExternalStore } from 'react';

export type OnboardingStatus = 'unseen' | 'in_progress' | 'completed' | 'skipped';

export interface PersistedOnboardingState {
  status: OnboardingStatus;
  currentStep: number;
  isOpen: boolean;
  updatedAtIso: string;
  userUid?: string | null;
}

export const TOTAL_TUTORIAL_STEPS = 8;
const ONBOARDING_STORAGE_KEY = 'synout_onboarding_tutorial_v1';

function clampTutorialStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(TOTAL_TUTORIAL_STEPS - 1, Math.floor(step)));
}

function resolveUserStorageKey(userUid?: string | null): string {
  return userUid ? `${ONBOARDING_STORAGE_KEY}_${userUid}` : ONBOARDING_STORAGE_KEY;
}

function readStoredState(storageKey: string): Omit<PersistedOnboardingState, 'isOpen'> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedOnboardingState>;
    if (
      parsed &&
      (parsed.status === 'unseen' ||
        parsed.status === 'in_progress' ||
        parsed.status === 'completed' ||
        parsed.status === 'skipped')
    ) {
      return {
        status: parsed.status,
        currentStep: clampTutorialStep(Number(parsed.currentStep ?? 0)),
        updatedAtIso:
          typeof parsed.updatedAtIso === 'string'
            ? parsed.updatedAtIso
            : new Date().toISOString(),
        userUid: parsed.userUid ?? null,
      };
    }
  } catch {
    // Ignore storage read restrictions in sandboxed contexts
  }
  return null;
}

function writeStoredState(
  storageKey: string,
  stateToPersist: Omit<PersistedOnboardingState, 'isOpen'>
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(stateToPersist));
  } catch {
    // Ignore quota or private-mode restrictions; in-memory state still prevents reopening
  }
}

const initialPersisted = readStoredState(ONBOARDING_STORAGE_KEY);
const initialStatus: OnboardingStatus = initialPersisted?.status ?? 'unseen';
const initialShouldOpen = initialStatus === 'unseen' || initialStatus === 'in_progress';

let onboardingState: PersistedOnboardingState = {
  status: initialShouldOpen ? 'in_progress' : initialStatus,
  currentStep: initialPersisted ? clampTutorialStep(initialPersisted.currentStep) : 0,
  isOpen: initialShouldOpen,
  updatedAtIso: initialPersisted?.updatedAtIso ?? new Date().toISOString(),
  userUid: initialPersisted?.userUid ?? null,
};

const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function persistBothDeviceAndUser(next: PersistedOnboardingState): void {
  const payload: Omit<PersistedOnboardingState, 'isOpen'> = {
    status: next.status,
    currentStep: next.currentStep,
    updatedAtIso: next.updatedAtIso,
    userUid: next.userUid ?? null,
  };
  writeStoredState(ONBOARDING_STORAGE_KEY, payload);
  if (next.userUid) {
    writeStoredState(resolveUserStorageKey(next.userUid), payload);
  }
}

export function getOnboardingState(): PersistedOnboardingState {
  return onboardingState;
}

export function syncOnboardingWithAuthUser(userUid?: string | null): void {
  if (!userUid) return;
  const userSaved = readStoredState(resolveUserStorageKey(userUid));
  if (
    userSaved &&
    (userSaved.status === 'completed' || userSaved.status === 'skipped') &&
    onboardingState.status === 'in_progress'
  ) {
    onboardingState = {
      ...onboardingState,
      status: userSaved.status,
      currentStep: userSaved.currentStep,
      isOpen: false,
      userUid,
      updatedAtIso: new Date().toISOString(),
    };
    persistBothDeviceAndUser(onboardingState);
    notifyListeners();
    return;
  }

  onboardingState = {
    ...onboardingState,
    userUid,
  };
  persistBothDeviceAndUser(onboardingState);
}

export function setOnboardingStep(stepIndex: number): void {
  const nextStep = clampTutorialStep(stepIndex);
  onboardingState = {
    ...onboardingState,
    status:
      onboardingState.status === 'completed' || onboardingState.status === 'skipped'
        ? onboardingState.status
        : 'in_progress',
    currentStep: nextStep,
    updatedAtIso: new Date().toISOString(),
  };
  persistBothDeviceAndUser(onboardingState);
  notifyListeners();
}

export function skipOnboardingTutorial(): void {
  onboardingState = {
    ...onboardingState,
    status: 'skipped',
    isOpen: false,
    updatedAtIso: new Date().toISOString(),
  };
  persistBothDeviceAndUser(onboardingState);
  notifyListeners();
}

export function completeOnboardingTutorial(): void {
  onboardingState = {
    ...onboardingState,
    status: 'completed',
    currentStep: TOTAL_TUTORIAL_STEPS - 1,
    isOpen: false,
    updatedAtIso: new Date().toISOString(),
  };
  persistBothDeviceAndUser(onboardingState);
  notifyListeners();
}

export function closeOnboardingTutorial(): void {
  // Closing dismisses the tutorial without reopening on subsequent tab navigation
  const nextStatus: OnboardingStatus =
    onboardingState.status === 'completed' ? 'completed' : 'skipped';
  onboardingState = {
    ...onboardingState,
    status: nextStatus,
    isOpen: false,
    updatedAtIso: new Date().toISOString(),
  };
  persistBothDeviceAndUser(onboardingState);
  notifyListeners();
}

export function reopenOnboardingTutorial(startStep = 0): void {
  onboardingState = {
    ...onboardingState,
    currentStep: clampTutorialStep(startStep),
    isOpen: true,
    updatedAtIso: new Date().toISOString(),
  };
  notifyListeners();
}

export function resetOnboardingStateForTests(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  onboardingState = {
    status: 'in_progress',
    currentStep: 0,
    isOpen: true,
    updatedAtIso: new Date().toISOString(),
    userUid: null,
  };
  notifyListeners();
}

export function subscribeOnboardingState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOnboardingTutorial(): PersistedOnboardingState {
  return useSyncExternalStore(
    subscribeOnboardingState,
    getOnboardingState,
    getOnboardingState
  );
}
