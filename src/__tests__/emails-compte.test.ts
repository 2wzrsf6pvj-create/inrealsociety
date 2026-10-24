// Emails de compte à J0 : Supabase envoie la confirmation d'adresse et le mot
// de passe oublié. Ses modèles par défaut sont en anglais, et leur lien (PKCE)
// échoue hors du navigateur de l'inscription, par exemple depuis l'app Gmail.
// Les nôtres sont en français, et leur lien passe par /auth/confirm, qui
// vérifie le jeton côté serveur : il marche dans n'importe quel navigateur.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyOtp = vi.hoisted(() => vi.fn());
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { verifyOtp } }) }));

import { supabaseConfirmSignup, supabaseResetPassword } from '@/lib/email-templates';
import { GET as confirm } from '@/app/auth/confirm/route';

const ROOT = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('modèles des emails de compte (Supabase)', () => {
  it('confirmation : en français, lien vers /auth/confirm puis /register (le code est gardé sur le compte)', () => {
    const { subject, html } = supabaseConfirmSignup();
    expect(subject).toBe('Confirmez votre adresse email');
    expect(html).toContain('href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;next=/register"');
    expect(html).toContain('Confirmer mon adresse');
    expect(html).not.toContain('ConfirmationURL');
    expect(html).toContain('In Real Society');
  });

  it('mot de passe oublié : en français, lien vers /auth/confirm puis le choix du mot de passe', () => {
    const { subject, html } = supabaseResetPassword();
    expect(subject).toBe('Réinitialisez votre mot de passe');
    expect(html).toContain('href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=/auth/reset-password"');
    expect(html).not.toContain('ConfirmationURL');
  });

  it('les fichiers à coller dans Supabase suivent le code (npx tsx scripts/supabase-email-templates.mts)', () => {
    expect(read('supabase/templates/confirmation.html')).toBe(`${supabaseConfirmSignup().html}\n`);
    expect(read('supabase/templates/recovery.html')).toBe(`${supabaseResetPassword().html}\n`);
    const config = read('supabase/config.toml');
    expect(config).toContain('subject = "Confirmez votre adresse email"\ncontent_path = "./supabase/templates/confirmation.html"');
    expect(config).toContain('subject = "Réinitialisez votre mot de passe"\ncontent_path = "./supabase/templates/recovery.html"');
  });
});

describe('/auth/confirm : le lien de l’email, ouvert dans n’importe quel navigateur', () => {
  const open = (query: string) => confirm(new NextRequest(`http://localhost:3000/auth/confirm?${query}`));
  beforeEach(() => { verifyOtp.mockReset(); });

  it('jeton valable : session ouverte côté serveur, puis /register', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await open('token_hash=abc123&type=email&next=/register');
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc123' });
    expect(res.headers.get('location')).toBe('http://localhost:3000/register');
  });

  it('jeton expiré ou déjà utilisé : la page de connexion l’explique', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Email link is invalid or has expired' } });
    const res = await open('token_hash=abc123&type=email&next=/register');
    expect(res.headers.get('location')).toBe('http://localhost:3000/auth/login?error=auth_failed');
  });

  it('jamais de redirection hors du site', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await open(`token_hash=abc123&type=email&next=${encodeURIComponent('https://ailleurs.example')}`);
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });

  it('lien incomplet : refusé sans appeler Supabase', async () => {
    const res = await open('type=email&next=/register');
    expect(res.headers.get('location')).toBe('http://localhost:3000/auth/login?error=missing_code');
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
