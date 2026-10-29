import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  oAuthClientId?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function resolveFirebaseConfig(): FirebaseAppletConfig | null {
  try {
    const meta = import.meta as unknown as {
      glob?: (
        pattern: string,
        opts: { eager: boolean; import: string }
      ) => Record<string, FirebaseAppletConfig>;
      env?: Record<string, string | undefined>;
    };

    if (typeof meta.glob === 'function') {
      const modules = meta.glob('/firebase-applet-config.json', {
        eager: true,
        import: 'default',
      });
      const loaded = modules['/firebase-applet-config.json'];
      if (loaded && loaded.projectId && loaded.apiKey) {
        return loaded;
      }
    }

    const env = meta.env || {};
    if (env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_APP_ID) {
      return {
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        apiKey: env.VITE_FIREBASE_API_KEY,
        appId: env.VITE_FIREBASE_APP_ID,
        authDomain:
          env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || '(default)',
      };
    }
  } catch {
    // Graceful fallback when running in headless Node tests without Vite bundler
  }
  return null;
}

export const firebaseConfig: FirebaseAppletConfig | null = resolveFirebaseConfig();
export const isFirebaseConfigured = Boolean(
  firebaseConfig &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== 'remixed-project-id' &&
    firebaseConfig.apiKey
);

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let firebaseAuth: Auth | null = null;

if (isFirebaseConfigured && firebaseConfig) {
  firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  firestoreDb = firebaseConfig.firestoreDatabaseId
    ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
    : getFirestore(firebaseApp);
  firebaseAuth = getAuth(firebaseApp);
}

export const app = firebaseApp;
export const db = firestoreDb;
export const auth = firebaseAuth;

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionValidated = false;

export async function validateFirestoreBootConnection(): Promise<void> {
  if (connectionValidated || typeof window === 'undefined' || !db) return;
  connectionValidated = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined' && isFirebaseConfigured) {
  void validateFirestoreBootConnection();
}
