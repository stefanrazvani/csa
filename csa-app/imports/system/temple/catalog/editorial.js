// Server-only editorial release registry. Items marked as requiring review in
// the source catalog are never published merely because they exist there.
// This registry releases only the abstract, paraphrased educational models
// reviewed for the 2026.07.13 implementation. Optional/event content remains
// disabled until a tenant explicitly enables it from the approved optional set.

export const EDITORIAL_RELEASE = Object.freeze({
  id: 'csa-temple-2026.07.13',
  approvedSymbolIds: Object.freeze([
    'g1-rough-stone',
    'g1-plumb-axis',
    'g1-mosaic-floor',
    'g1-three-pillars',
    'g1-threshold-columns',
    'g1-great-lights',
    'g1-star-vault',
    'g2-cubic-stone',
    'g2-level',
    'g2-blazing-star',
    'g2-paired-spheres',
    'g2-five-senses',
    'g2-great-lights',
    'g2-tracing-board',
    'g3-acacia',
    'g3-circle-center',
    'g3-great-lights',
    'g3-memory-veil',
    'g3-master-board',
    'g3-travel-lines',
  ]),
  approvedOptionalSymbolIds: Object.freeze([
    // Intentionally empty. Event-specific symbols require a later release.
  ]),
});

