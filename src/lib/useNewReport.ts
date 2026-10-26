"use client";

import { useStore, useMe } from "./store";

/**
 * Starts a standard A4 report on the venue's letterhead (see lib/reportPdf.ts), prepared by the signed-in user.
 * The PDF library is only loaded when a report is actually downloaded.
 */
export function useNewReport() {
  const settings = useStore((s) => s.settings);
  const me = useMe();
  return async (title: string, period?: string, opts: { landscape?: boolean } = {}) => {
    const { ReportPdf } = await import("./reportPdf");
    return new ReportPdf(settings, { title, period, preparedBy: me?.name, landscape: opts.landscape });
  };
}
