export class PalladiumPowerSheet extends ItemSheet {
  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      classes: ["palladium", "sheet", "item", "power"],
      width: 500,
      height: 400,
      template: "systems/palladium/templates/item/power-sheet.html"
    };
  }
}