/**
 * A simple Item Sheet for Skill type items.
 */
export class PalladiumSkillSheet extends ItemSheet {

  /** @override */
  static get defaultOptions() {
    return {
      ...super.defaultOptions,
      classes: ["palladium", "sheet", "item", "skill"],
      width: 400,
      height: 200,
      template: "systems/palladium/templates/item/skill-sheet.html"
    };
  }
}