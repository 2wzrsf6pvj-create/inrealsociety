// src/lib/push-service.ts — Service de notifications d'un appareil abonné, lu
// dans l'adresse (endpoint) de son abonnement : chaque navigateur passe par
// celui de son éditeur. Pour les chiffres et la recherche de /admin.

export type PushService = 'apple' | 'google' | 'mozilla' | 'microsoft' | 'other';

/** Apple : l'app installée sur iPhone ou iPad, Safari sur Mac. Google : Chrome
 *  et les navigateurs Android qui en dérivent. Mozilla : Firefox. Microsoft :
 *  Edge sur Windows. */
const HOSTS: [suffix: string, service: PushService][] = [
  ['apple.com', 'apple'],
  ['googleapis.com', 'google'],
  ['mozilla.com', 'mozilla'],
  ['windows.com', 'microsoft'],
];

export const PUSH_SERVICE_LABELS: Record<PushService, string> = {
  apple: 'Apple', google: 'Google', mozilla: 'Mozilla', microsoft: 'Microsoft', other: 'autre',
};

export function pushService(endpoint: string): PushService {
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  return HOSTS.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))?.[1] ?? 'other';
}
