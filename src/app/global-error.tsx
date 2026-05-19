'use client';

// Global error boundary App Router — capture les erreurs de rendu React
// au niveau racine (layout, etc.) que les error.tsx individuels ne peuvent
// pas attraper. Doit déclarer son propre <html> / <body> car le RootLayout
// est en panne quand cette page rend.

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
