export function createDiagnosticSession() {
  let attempted = false, closed = false;
  let visibleId: string | null = null;
  return {
    consent() { if (attempted || closed) return false; attempted = true; return true; },
    close() { closed = true; },
    markIdVisible(id: string) {
      if (!attempted || closed || !/^[a-f0-9]{32}$/.test(id) || (visibleId !== null && visibleId !== id)) return false;
      visibleId = id; return true;
    },
    snapshot: () => ({ attempted, closed, visibleId }),
  };
}
export type DiagnosticSession = ReturnType<typeof createDiagnosticSession>;
// This module lives for the document, including React remounts. No persistence or reset API.
export const diagnosticSession = createDiagnosticSession();
