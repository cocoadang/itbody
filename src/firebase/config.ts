import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, type Functions } from 'firebase/functions';
import rawConfig from '../../firebase-applet-config.json';

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

// Vite replaces DEV at build time. Production builds cannot enable the sandbox
// through URLs, localStorage or role selection. Set VITE_DEV_SANDBOX=false
// to use real Firebase authentication during local integration testing.
export const isDevSandbox = import.meta.env?.DEV === true && import.meta.env.VITE_DEV_SANDBOX !== 'false';

export const firebaseConfig: FirebaseAppletConfig = rawConfig;

let app: FirebaseApp;
let db: Firestore;
let defaultDb: Firestore | null = null;
let auth: Auth;
let storage: FirebaseStorage | null = null;
let functions: Functions;
let isFirestoreAvailable = false;
let initError: string | null = null;

if (!isDevSandbox) try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  // If a specific firestore database ID is configured, connect to that database instance
  const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : '(default)';

  // Optional fields left blank (e.g. an internal note) arrive as undefined; Firestore rejects
  // those by default, which made new journal entries fail to save. Skip them instead.
  try {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true }, databaseId);
  } catch {
    db = getFirestore(app, databaseId);
  }
  try {
    defaultDb = getFirestore(app, '(default)');
  } catch {
    defaultDb = null;
  }
  auth = getAuth(app);
  functions = getFunctions(app, 'asia-northeast1');

  if (firebaseConfig.storageBucket) {
    storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);
  }
  isFirestoreAvailable = true;
} catch (error) {
  console.error('[Firebase Init Error]', error);
  initError = error instanceof Error ? error.message : 'Unknown Firebase initialization error';
  isFirestoreAvailable = false;
}

export { app, db, defaultDb, auth, storage, functions, isFirestoreAvailable, initError };
