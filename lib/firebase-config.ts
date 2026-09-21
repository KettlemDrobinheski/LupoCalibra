export type PublicFirebaseConfig = {
  apiKey?: string; authDomain?: string; projectId?: string; appId?: string;
  storageBucket?: string; messagingSenderId?: string;
};

export function validateFirebaseConfig(config: PublicFirebaseConfig) {
  const required = {
    apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
    authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
  } as const;
  const missing = Object.entries(required).filter(([key]) => !config[key as keyof PublicFirebaseConfig]?.trim()).map(([, name]) => name);
  if (missing.length) throw new Error(`Configuração Firebase ausente: ${missing.join(', ')}. Configure o ambiente e reinicie a aplicação.`);
  return config;
}
