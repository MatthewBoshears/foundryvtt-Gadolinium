export class PalladiumEffectSheet extends ItemSheet {
  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      classes: ["palladium", "sheet", "item", "effect"],
      width: 400,
      height: "auto",
      template: "systems/palladium/templates/item/effect-sheet.html"
    };
  }
  /** @override */
  async getData(options) {
    const context = await super.getData(options);

    // Prepare the list of core status effects for the dropdown.
    context.statusEffects = CONFIG.statusEffects;

    return context;
  }
}