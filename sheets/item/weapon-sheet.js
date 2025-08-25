export class PalladiumWeaponSheet extends ItemSheet {
  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      classes: ["palladium", "sheet", "item", "weapon"],
      width: 400,
      height: 200,
      template: "systems/palladium/templates/item/weapon-sheet.html"
    };
  }
}