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

  _prepareSkills() {
    if (!['character', 'npc'].includes(this.type)) return;
    const actorData = this.system;
    const level = parseInt(actorData.level?.value ?? 1);
    const iq = parseInt(actorData.attributes?.iq?.value ?? 0);
    let iqBonus = 0;
    if (iq >= 16) {
      iqBonus = iq - 14;
      if (iq >= 35) iqBonus += 2;
      if (iq >= 40) iqBonus += 2;
      if (iq >= 45) iqBonus += 2;
    }
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
  async _onCreateEmbeddedDocuments(embeddedName, documents, result, options, userId) {
    super._onCreateEmbeddedDocuments(embeddedName, documents, result, options, userId);

    // DEBUG: Check if the hook is firing at all.
    console.log(`Palladium | Hook triggered for creating: ${embeddedName}`);

    if (embeddedName !== "Item") return;

    const effectItems = documents.filter(d => d.type === "effect");

    // DEBUG: Check if we found any items with the type "effect".
    console.log(`Palladium | Found effect items to process:`, effectItems);

    if (effectItems.length === 0) return;

    const effectsToCreate = [];
    for (const item of effectItems) {
      const appliesTo = [];
      if (item.system.appliesTo.weaponAttacks) appliesTo.push("Attacks");
      if (item.system.appliesTo.defenses) appliesTo.push("Defenses");
      if (item.system.appliesTo.savingThrows) appliesTo.push("Saves");
      
      const effectData = {
        label: item.name,
        icon: item.img,
        origin: item.uuid,
        duration: { },
        changes: [],
        flags: {
          palladium: {
            penalty: item.system.penalty,
            appliesToString: appliesTo.join(', ')
          }
        }
      };
      
      const penalty = item.system.penalty ?? 0;
      if (item.system.appliesTo?.weaponAttacks) {
        effectData.changes.push({ key: "system.penalties.weaponAttacks", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: penalty });
      }
      if (item.system.appliesTo?.defenses) {
        effectData.changes.push({ key: "system.penalties.defenses", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: penalty });
      }
      if (item.system.appliesTo?.savingThrows) {
        effectData.changes.push({ key: "system.penalties.savingThrows", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: penalty });
      }
      effectsToCreate.push(effectData);
    }

    // DEBUG: Check the data we're about to use to create the Active Effect.
    console.log(`Palladium | Data for new ActiveEffects:`, effectsToCreate);
    
    if (effectsToCreate.length > 0) {
      await this.createEmbeddedDocuments("ActiveEffect", effectsToCreate);
      
      // --- IMPORTANT TEST ---
      // We are temporarily disabling the line that deletes the original item.
      // await this.deleteEmbeddedDocuments("Item", effectItems.map(i => i.id));
      
      console.log(`Palladium | ActiveEffect creation complete.`);
    }
  }
}