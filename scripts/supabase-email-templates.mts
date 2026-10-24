// Écrit les modèles des emails de compte envoyés par Supabase, prêts à coller
// dans Authentication → Email Templates (cf. src/lib/email-templates.ts).
// Usage :
//   npx tsx scripts/supabase-email-templates.mts
// Vérifié par vitest (emails-compte.test.ts) : les fichiers suivent le code.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { supabaseConfirmSignup, supabaseResetPassword } from '../src/lib/email-templates';

const DIR = join(import.meta.dirname, '..', 'supabase', 'templates');
writeFileSync(join(DIR, 'confirmation.html'), `${supabaseConfirmSignup().html}\n`);
writeFileSync(join(DIR, 'recovery.html'), `${supabaseResetPassword().html}\n`);
console.log('supabase/templates/confirmation.html et recovery.html écrits.');
