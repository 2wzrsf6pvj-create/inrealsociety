# Migrations avec la Supabase CLI

> Objectif : ne plus appliquer les migrations à la main. La base garde la liste
> de ce qui est appliqué (`supabase_migrations.schema_migrations`), et
> `supabase db push` n'envoie que ce qui manque.
>
> Procédure validée le 2026-10-22 avec la CLI **2.121.0** sur une base simulant
> la prod (migrations appliquées à la main jusqu'à 053, puis `repair` + `push`).

---

## Pourquoi `repair` d'abord (⚠️ ne pas sauter)

Ta base de prod a reçu ses migrations **à la main** : elle ne contient aucun
historique CLI. Sans `repair`, `supabase db push` considère que **rien** n'est
appliqué et tente de **rejouer les 54 migrations** sur la prod — plusieurs ne
sont pas rejouables (`CREATE POLICY` sans garde), et celles qui le sont
écraseraient l'état actuel. Vérifié : avant `repair`, le dry-run liste
`001_enable_rls.sql`, `002_…`, etc.

`migration repair --status applied` **n'exécute aucun SQL** : il inscrit
seulement les versions comme déjà appliquées.

---

## Mise en place (une seule fois)

Prérequis : la CLI (`npx supabase …` suffit, ou `brew install supabase/tap/supabase`)
et le **mot de passe de la base** (Dashboard → Project Settings → Database).
`supabase/config.toml` est déjà dans le dépôt (généré par `supabase init`).

### 1. Lier le dépôt au projet
```bash
npx supabase login                          # ouvre le navigateur
npx supabase link --project-ref <ref>       # <ref> = l'id dans l'URL du dashboard
```

### 2. Vérifier ce qui est RÉELLEMENT appliqué en prod
Avant de marquer quoi que ce soit, s'assurer que la dernière migration est bien
en base — le marquage doit refléter la réalité :
```bash
psql "$DATABASE_URL" -f scripts/verify-migrations.sql
```
Chaque section `=== 0NN` doit afficher le résultat « attendu ». Si une migration
manque, l'appliquer d'abord (SQL Editor), puis revenir ici.

### 3. Marquer l'existant comme appliqué (sans rien exécuter)
Remplacer `53` par le numéro de la **dernière migration appliquée en prod** :
```bash
npx supabase migration repair --status applied $(seq -f "%03g" 1 53)
```
Résultat attendu : `Repaired migration history: [001 … 053] => applied`.

### 4. Contrôler
```bash
npx supabase migration list           # colonnes Local et Remote identiques jusqu'à 053
npx supabase db push --dry-run        # ne liste QUE les migrations pas encore appliquées
```
Si le dry-run liste `001_…`, **s'arrêter** : l'étape 3 n'a pas pris.

---

## Ensuite, à chaque fusion qui ajoute une migration

```bash
git pull
npx supabase db push --dry-run        # relire la liste
npx supabase db push                  # confirme, applique, enregistre
psql "$DATABASE_URL" -f scripts/verify-migrations.sql
```
Un second `db push` répond `Remote database is up to date.`

**Ordre code ↔ base** : appliquer la migration **avant** (ou juste après) le
déploiement Vercel du code qui s'en sert. Le code récent tolère une colonne
absente, mais la fonctionnalité ne marche qu'une fois la migration appliquée.

Pas d'application automatique au merge (GitHub Action / intégration Supabase)
tant qu'il n'y a pas d'environnement de staging : une migration ratée partirait
directement en prod.

---

## Limites connues

- **Base neuve** : la CLI applique dans l'ordre des numéros, or `001_…` dépend de
  tables créées en `015`. `supabase db push` / `db reset` sur une base **vide**
  échoue donc. Pour un nouveau projet : coller `scripts/fresh-setup.sql` dans le
  SQL Editor (cf. `DEPLOY_CHECKLIST.md`), puis faire l'étape 3 avec le dernier
  numéro inclus dans le bundle.
- **Nouvelles migrations** : garder la numérotation `0NN_nom.sql` (la CLI accepte
  ces versions), puis régénérer le bundle : `node scripts/build-fresh-setup.mjs`.
