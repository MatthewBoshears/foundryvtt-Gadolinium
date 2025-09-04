export class PalladiumActor extends Actor {

  // NOTE: All special hooks for handling 'effect' items
  // (_onCreateEmbeddedDocuments, _preDeleteEmbeddedDocuments, _createEffect)
  // have been permanently removed from this file.

  async _preUpdate(changed, options, user) {
    await super._preUpdate(changed, options, user);
    if (foundry.utils.hasProperty(changed, "system.health.value")) {
      if (this.system.health.value > 0 && changed.system.health.value <= 0) {
        for (const token of this.getActiveTokens()) {
          const deadIcon = CONFIG.statusEffects.find(e => e.id === "dead");
          if (deadIcon) await token.toggleEffect(deadIcon, { active: true, overlay: true });
          if (token.inCombat) {
            await token.combatant.delete();
            ChatMessage.create({ speaker: ChatMessage.getSpeaker({token: token}), content: `${token.name} has been defeated!` });
          }
        }
      }
    }
  }

  _preCreate(data, options, user) {
    super._preCreate(data, options, user);
    if (['character', 'npc'].includes(data.type) && !this.prototypeToken.name) {
      this.updateSource({ 'prototypeToken.name': data.name });
    }
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.system.notes = this.system.notes ?? "";
    this._prepareSkills();
  }

  _calculateIqBonus(iq) {
    if (iq < 16) {
      return 0;
    }
    if (iq <= 30) {
      return iq - 14;
    }

    const baseBonusAt30 = 16;
    const pointsAbove30 = iq - 30;
    const fivePointIntervals = Math.floor(pointsAbove30 / 5);
    const bonusFromIntervals = fivePointIntervals * 2;

    return baseBonusAt30 + bonusFromIntervals;
  }

  _prepareSkills() {
    if (!['character', 'npc'].includes(this.type)) return;
    const actorData = this.system;
    const level = parseInt(actorData.level?.value ?? 1);
    const iq = parseInt(actorData.attributes?.iq?.value ?? 0);

    const iqBonus = this._calculateIqBonus(iq)
    
    const skills = this.items.filter(item => item.type === 'skill');
    for (const skill of skills) {
      const skillData = skill.system;
      const baseValue = parseInt(skillData.base ?? 0);
      const perLevelValue = parseInt(skillData.perLevel ?? 0);
      const levelBonus = (level - 1) * perLevelValue;
      const calculatedTotal = baseValue + levelBonus + iqBonus;
      skillData.total = Math.min(calculatedTotal, 98);
    }
  }
}