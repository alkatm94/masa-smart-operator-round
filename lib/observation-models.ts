export const OBSERVATION_MODEL_TARGETS = ["sight_glass", "water_leak", "water_pooling", "corrosion", "open_panel_door", "panel_indicator"] as const;
export class ObservationModelStatus {
  private installed = false;
  async load() {
    try { this.installed = (await fetch("/models/operator-observations/model.json", { cache: "no-cache" })).ok; } catch { this.installed = false; }
    return this.installed;
  }
  isReady() { return this.installed; }
  status() { return this.installed ? "Operator observation model metadata installed" : "Observation models: Not Trained"; }
}
