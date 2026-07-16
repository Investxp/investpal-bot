'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Fires a warning toast on first mount if either required env var is not set.
 * Skipped in preview mode (NEXT_PUBLIC_PREVIEW_MODE=true) or when the current
 * route is the /preview page, since env vars are intentionally absent there.
 * Renders nothing â€” exists only for its side effect.
 *
 * Mounted inside TemplateLayout so every template app gets this check
 * automatically.
 */
export function EnvCheck() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true') return;
    if (window.location.pathname.includes('/preview')) return;
    if (!process.env.NEXT_PUBLIC_DERIV_APP_ID) {
      toast.warning('Waiting for environment variables to be setâ€¦');
    }
  }, []);

  return null;
}
