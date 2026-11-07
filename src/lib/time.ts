/** Wall-clock helpers kept out of component bodies (server components are rendered per request, so this is safe). */
export const nowMs = () => Date.now();
export const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
