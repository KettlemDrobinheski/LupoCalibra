import nextEnv from '@next/env';
import { validateFirebaseConfig } from '../lib/firebase-config.ts';

nextEnv.loadEnvConfig(process.cwd());
try {
  validateFirebaseConfig({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  console.log('Required public Firebase variables are present. Values are not displayed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Firebase environment validation failed.');
  process.exitCode = 1;
}
