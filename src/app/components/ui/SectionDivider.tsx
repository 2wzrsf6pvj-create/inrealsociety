// Séparateur de section avec label centré : ──── LABEL ────
// Style des en-têtes de section du dashboard (text-xs, tracking 0.18em, gray/30).
// Pour les séparateurs inline de formulaire (style différent, ex. "ou rédigez"),
// garder le markup local — ce n'est pas le même composant conceptuel.

export default function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 h-px bg-brand-gray/10" />
      <span className="font-ui text-xs text-brand-gray/55 tracking-[0.18em] uppercase">{label}</span>
      <div className="flex-1 h-px bg-brand-gray/10" />
    </div>
  );
}
