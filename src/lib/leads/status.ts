/** Lead status is derived from the pipeline stage so reports and automation stay consistent with custom pipelines. */
export function statusForStage(kind: "open" | "won" | "lost", position: number): "new" | "qualified" | "contacted" | "converted" | "lost" {
  if (kind === "won") return "converted";
  if (kind === "lost") return "lost";
  return position <= 1 ? "new" : position === 2 ? "qualified" : "contacted";
}
