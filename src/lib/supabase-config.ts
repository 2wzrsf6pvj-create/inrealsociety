// Helper partagé : fallback placeholder pour permettre au dev de lancer
// `npm run dev` sans .env.local. Les clients se construisent, mais TOUTES les
// requêtes Supabase échoueront au niveau réseau (DNS vers demo.local). Le but
// est juste de ne pas crasher à l'import — pas d'avoir des données.

const PLACEHOLDER_URL = 'https://demo.local';
const PLACEHOLDER_KEY = 'placeholder-key';

export const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL      || PLACEHOLDER_URL;
export const SUPABASE_ANON_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || PLACEHOLDER_KEY;

export const SUPABASE_CONFIGURED = SUPABASE_URL !== PLACEHOLDER_URL && SUPABASE_ANON_KEY !== PLACEHOLDER_KEY;
