export class PalladiumCharacterSheet extends ActorSheet {

  constructor(...args) {
    super(...args);
    this._notesEditing = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["palladium", "sheet", "actor", "character"],
      template: "systems/palladium/templates/actor/character-sheet.html",
      width: 800,
      height: 800,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "overview" }]
    });
  }

  /**
   * @override
   * Prepare the data context for sheet rendering.
   */
  async getData(options) {
    // This is the CRUCIAL line. It loads the default context, including 'isGM'.
    const context = await super.getData(options);
    context.notesEditing = this._notesEditing; // <-- ADD THIS LINE

    // Prepare actor data
    context.enrichedNotes = await TextEditor.enrichHTML(this.actor.system.notes ?? "", { async: true, relativeTo: this.actor });

    // Prepare items
    context.skills = this.actor.items.filter(item => item.type === 'skill').sort((a, b) => a.name.localeCompare(b.name));
    context.weapons = this.actor.items.filter(item => item.type === 'weapon').sort((a, b) => a.name.localeCompare(b.name));
    const powers = this.actor.items.filter(item => item.type === 'power').sort((a, b) => a.name.localeCompare(b.name));

    // Prepare active effects for display
    context.effects = this.actor.effects.map(effect => {
      const effectData = effect.toObject(false);
      effectData.id = effect.id; // Ensure the ID is present for the template
      effectData.displayData = {
        penalty: effect.getFlag("palladium", "penalty"),
        appliesToString: effect.getFlag("palladium", "appliesToString")
      };
      return effectData;
    });

    // Enrich power descriptions and prepare save labels
    await Promise.all(powers.map(async (power) => {
      power.saveLabel = this.actor.system.saves[power.system.saveType]?.label ?? "N/A";
      power.enrichedDescription = await TextEditor.enrichHTML(power.system.description ?? "", { async: true, relativeTo: this.actor });
    }));
    context.powers = powers;

    // Prepare weapon maneuver labels
    for (const weapon of context.weapons) {
      const maneuverKey = weapon.system.maneuver ?? 'strike';
      const maneuverLabel = this.actor.system.maneuvers[maneuverKey]?.label ?? 'N/A';
      weapon.maneuverLabel = maneuverLabel;
    }

    return context;
  }

  /**
   * @override
   * Activate event listeners for the sheet.
   */
  activateListeners(html) {
    super.activateListeners(html);
    
    // Sidebar Controls
    html.find('.reset-sdc').on('click', this._onResetSDC.bind(this));
    html.find('.reset-essentials').on('click', this._onResetEssentials.bind(this));
    html.find('.adjust-actions').on('click', this._onAdjustActions.bind(this));
    html.find('.adjust-isp').on('click', this._onAdjustISP.bind(this));
    html.find('.adjust-chi').on('click', this._onAdjustChi.bind(this));

    // General Controls
    html.find('.effect-edit').on('click', this._onEffectEdit.bind(this));
    html.find('.item-edit').on('click', this._onItemEdit.bind(this));
    html.find('.item-delete').on('click', this._onItemDelete.bind(this));
    html.find('.item-toggle').on('click', this._onItemToggle.bind(this));
    html.find('.effect-delete').on('click', this._onEffectDelete.bind(this));
    html.find('.roll-skill').on('click', this._onRollSkill.bind(this));
    html.find('.roll-generic').on('click', this._onGenericRoll.bind(this));
    html.find('.roll-maneuver').on('click', this._onManeuverRoll.bind(this));
    html.find('.roll-weapon-attack').on('click', this._onWeaponAttackRoll.bind(this));
    html.find('.post-power').on('click', this._onPostPower.bind(this));
    html.find('.aimed-shot-checkbox').on('change', this._onToggleAimedShot.bind(this));
    html.find('.called-shot-checkbox').on('change', this._onToggleCalledShot.bind(this));
    html.find('.roll-perception').on('click', this._onRollPerception.bind(this));
    html.find('.edit-notes').on('click', this._onEditNotes.bind(this));
    html.find('.cancel-notes-edit').on('click', this._onCancelNotesEdit.bind(this));
  }

  // --- Sidebar Button Handlers ---

  _onResetSDC(event) {
    event.preventDefault();
    const actorData = this.actor.system;
    this.actor.update({
      'system.sdc.value': actorData.sdc.max,
      'system.armor.wornSdc.value': actorData.armor.wornSdc.max
    });
    ui.notifications.info("SDC and Armor SDC have been restored.");
  }

  _onResetEssentials(event) {
    event.preventDefault();
    const actorData = this.actor.system;
    this.actor.update({
      'system.isp.value': actorData.isp.max,
      'system.chi.value': actorData.chi.max
    });
    ui.notifications.info("ISP and Chi have been restored.");
  }

  _onAdjustActions(event) {
    event.preventDefault();
    const actions = this.actor.system.actions;
    const amount = parseInt(event.currentTarget.dataset.amount, 10);
    const currentValue = parseInt(actions.value, 10) || 0;
    let newValue = currentValue + amount;
    newValue = Math.max(0, Math.min(newValue, actions.max));
    this.actor.update({ 'system.actions.value': newValue });
  }

  _onAdjustISP(event) {
    event.preventDefault();
    const isp = this.actor.system.isp;
    const baseAmount = parseInt(event.currentTarget.dataset.amount, 10);
    const finalAmount = event.shiftKey ? baseAmount * 5 : baseAmount;
    const currentValue = parseInt(isp.value, 10) || 0;
    let newValue = currentValue + finalAmount;
    newValue = Math.max(0, Math.min(newValue, isp.max));
    this.actor.update({ 'system.isp.value': newValue });
  }

  _onAdjustChi(event) {
    event.preventDefault();
    const chi = this.actor.system.chi;
    const baseAmount = parseInt(event.currentTarget.dataset.amount, 10);
    const finalAmount = event.shiftKey ? baseAmount * 5 : baseAmount;
    const currentValue = parseInt(chi.value, 10) || 0;
    let newValue = currentValue + finalAmount;
    newValue = Math.max(0, Math.min(newValue, chi.max));
    this.actor.update({ 'system.chi.value': newValue });
  }

  // --- Item/Effect Control Handlers ---

  _onItemEdit(event) {
    event.preventDefault();
    const itemElement = event.currentTarget.closest(".item");
    if (!itemElement) return;
    const item = this.actor.items.get(itemElement.dataset.itemId);
    if (item) item.sheet.render(true);
  }

  _onItemDelete(event) {
    event.preventDefault();
    const itemElement = event.currentTarget.closest(".item");
    if (!itemElement) return;
    const item = this.actor.items.get(itemElement.dataset.itemId);
    if (!item) return;
    new Dialog({
      title: `Delete ${item.name}`,
      content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
      buttons: {
        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: "Delete",
          callback: () => this.actor.deleteEmbeddedDocuments("Item", [item.id])
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        },
      },
      default: "cancel"
    }).render(true);
  }

  _onEffectDelete(event) {
    event.preventDefault();
    const effectId = event.currentTarget.closest(".item").dataset.effectId;
    const effect = this.actor.effects.get(effectId);
    if (effect) effect.delete();
  }
  
  async _onEffectEdit(event) {
    event.preventDefault();
    const effectElement = event.currentTarget.closest(".item");
    if (!effectElement) return;
    const effect = this.actor.effects.get(effectElement.dataset.effectId);
    if (effect) {
      effect.sheet.render(true);
    }
  }

  _onItemToggle(event) {
    event.preventDefault();
    const toggler = $(event.currentTarget);
    const itemRow = toggler.closest('.item');
    const description = itemRow.next('.item-description');
    toggler.find('i').toggleClass('fa-caret-right fa-caret-down');
    description.slideToggle(200);
  }  
  async _onRollSkill(event) { 
    event.preventDefault(); 
    const itemElement = event.currentTarget.closest(".item"); 
    const item = this.actor.items.get(itemElement.dataset.itemId); 
    if (!item) return; const roll = new Roll("1d100"); 
    await roll.evaluate(); const success = roll.total <= item.system.total; 
    const resultText = success ? `<strong class="chat-success">SUCCESS</strong>` : `<strong class="chat-failure">FAILURE</strong>`; const flavorText = `<h2>Skill: ${item.name}</h2><p>Target: ${item.system.total}%</p>${resultText}`; await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: flavorText, flags: { core: { classes: ["palladium"] } } }); }
  async _onGenericRoll(event) { event.preventDefault(); const element = event.currentTarget; const dataset = element.dataset; const roll = new Roll(dataset.roll, this.actor.getRollData()); await roll.evaluate(); let resultText = ''; if (dataset.target) { const target = parseInt(dataset.target); const success = roll.total >= target; resultText = success ? `<strong class="chat-success">SUCCESS</strong>` : `<strong class="chat-failure">FAILURE</strong>`; } const flavorText = `<h2>${dataset.label}</h2>${resultText}`; await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: flavorText, flags: { core: { classes: ["palladium"] } } }); }
  async _onToggleAimedShot(event) { event.preventDefault(); await this.actor.setFlag("palladium", "aimedShot", event.currentTarget.checked); }
  async _onToggleCalledShot(event) { event.preventDefault(); await this.actor.setFlag("palladium", "calledShot", event.currentTarget.checked); }
  async _onManeuverRoll(event) { event.preventDefault(); const maneuverKey = event.currentTarget.dataset.maneuver; const maneuver = this.actor.system.maneuvers[maneuverKey]; if (!maneuver) return; const rollFormula = `1d20 + @attributes.pp.mod + ${maneuver.bonus} + @penalties.weaponAttacks`; const roll = new Roll(rollFormula, this.actor.getRollData()); await roll.evaluate(); await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<h2>Attack: ${maneuver.label}</h2>` }); }
  async _onPostPower(event) {
    event.preventDefault();
    const itemElement = event.currentTarget.closest(".item");
    const item = this.actor.items.get(itemElement.dataset.itemId);
    if (!item) return;
    const combatant = game.combat?.combatants.find(c => c.actorId === this.actor.id);

    if (combatant) {
      // If the actor is in combat, perform the action cost check.
      const actionCost = item.system.actionCost || 0;
      const currentActions = this.actor.system.actions.value;

      if (currentActions < actionCost) {
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `${this.actor.name} is trying to use ${item.name} and does not have enough actions. They have: ${currentActions} and need: ${actionCost}.`
        });
        return; // Stop the action.
      }
      
      // If the check passes, subtract actions before proceeding.
      await this.actor.update({ 'system.actions.value': currentActions - actionCost });
    }
    // --- END of MODIFIED LOGIC ---


    let content = await TextEditor.enrichHTML(item.system.description, {
        async: true
    });
    const powerData = {
        powerName: item.name,
        saveType: item.system.saveType,
        saveDC: item.system.saveDC,
        damageFormula: item.system.damageFormula
    };
    let buttons = '';
    if (item.system.saveType !== "none") {
        const saveLabel = this.actor.system.saves[item.system.saveType]?.label ?? "Save";
        buttons += `<button data-action="roll-power-save">${saveLabel} vs DC ${item.system.saveDC}</button>`;
    }
    if (item.system.damageFormula) {
        buttons += `<button data-action="roll-power-damage">Roll Damage</button>`;
    }
    if (buttons) {
        content += `<hr><div class="card-buttons">${buttons}</div>`;
    }
    ChatMessage.create({
        speaker: ChatMessage.getSpeaker({
            actor: this.actor
        }),
        flavor: `<h2>${item.name}</h2>`,
        content: content,
        flags: {
            palladium: {
                powerData
            }
        }
    });
  }
async _onWeaponAttackRoll(event) {
    event.preventDefault();
    const weaponId = event.currentTarget.closest(".item").dataset.itemId;
    if (!weaponId) return;
    const weapon = this.actor.items.get(weaponId);
    const targets = Array.from(game.user.targets);
    if (targets.length === 0) return ui.notifications.warn("Please target a token.");
    const target = targets[0];
    const targetActor = target.actor;

    const hasWornArmor = (targetActor.system.armor.worn ?? 0) > 0;
    const wornAR = targetActor.system.armor.worn ?? 0;
    const naturalAR = targetActor.system.armor.natural ?? 0;
    const primaryTargetAR = hasWornArmor ? wornAR : naturalAR;

    const isAimed = this.actor.getFlag("palladium", "aimedShot") ?? false;
    const isCalled = this.actor.getFlag("palladium", "calledShot") ?? false;
    const maneuverKey = weapon.system.maneuver || "strike";
    const maneuverBonus = this.actor.system.maneuvers[maneuverKey]?.bonus ?? 0;
    
    const attackFormula = `1d20 + ${maneuverBonus} + @penalties.weaponAttacks + ${isAimed ? 3 : 0} + ${isCalled ? -3 : 0}`;
    const attackRoll = new Roll(attackFormula, this.actor.getRollData());
    await attackRoll.evaluate();
    const renderedRoll = await attackRoll.render();

    const rangedManeuvers = ['sniper', 'proficientRanged', 'proficientThrown'];
    const minimumRoll = rangedManeuvers.includes(maneuverKey) ? 8 : 4;
    
    let isHit = attackRoll.total >= minimumRoll && attackRoll.total >= primaryTargetAR;
    
    const flavorText = `<h2>${weapon.name}</h2>`;
    
    let chatContent = `
      <p><strong>Attacker:</strong> ${this.actor.name}</p>
      <p><strong>Defender:</strong> ${target.name}</p>
      <p><strong>Target Number:</strong> ${primaryTargetAR}</p>
      <hr>
      ${renderedRoll}
    `;

    if (isHit) {
      chatContent += `<strong class="chat-success">HIT!</strong>`;
      const buttons = `<div class="card-buttons">
        <button data-action="roll-damage">Roll Damage</button>
        <button data-action="roll-defense" data-defense-type="parry" data-dc="${attackRoll.total}">Parry</button>
        <button data-action="roll-defense" data-defense-type="dodge" data-dc="${attackRoll.total}">Dodge</button>
      </div>`;
      chatContent += buttons;
    } else {
      let missReason = attackRoll.total < minimumRoll ? `(failed min. roll of ${minimumRoll})` : `(failed vs AR ${primaryTargetAR})`;
      chatContent += `<strong class="chat-failure">MISS! ${missReason}</strong>`;
    }

    const rollData = { 
      targetUuid: target.document.uuid, 
      targetTokenId: target.id, 
      damageFormula: weapon.system.damageFormula,
      weaponName: weapon.name,
      maneuverKey: maneuverKey
    };

    // --- AUTOMATED ANIMATIONS COMPATIBILITY ---
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: flavorText,
      content: chatContent,
      // NEW: Embed the roll object so other modules can see it.
      rolls: [attackRoll], 
      // NEW: Add the weapon's ID to a standard flag location.
      flags: {
        core: {
          sourceId: weapon.uuid 
        },
        palladium: { rollData }
      }
    });
    // --- END COMPATIBILITY CHANGES ---
  }


  async _onEffectEdit(event) {
    event.preventDefault();
    const effectElement = event.currentTarget.closest(".item");
    if (!effectElement) return;
    const effect = this.actor.effects.get(effectElement.dataset.effectId);
    if (effect) {
      // Open the default configuration sheet for the ActiveEffect itself
      effect.sheet.render(true);
    }
  }
/**
 * @override
 * Handle dropping Items onto the sheet.
 */
  async _onDropItem(event, data) {

    const item = await Item.fromDropData(data);
    if (!item) return;

    // If the dropped item is NOT an "effect", use the default Foundry behavior.
    if (item.type !== 'effect') {
      return super._onDropItem(event, data);
    }

    // --- If it IS an effect, we handle it manually ---

    console.log(`Palladium | Handling drop of 'effect' item: "${item.name}"`);

    // 1. Prepare the Active Effect data from the Item data.
    const appliesTo = [];
    if (item.system.appliesTo.weaponAttacks) appliesTo.push("Attacks");
    if (item.system.appliesTo.defenses) appliesTo.push("Defenses");
    if (item.system.appliesTo.savingThrows) appliesTo.push("Saves");

    const effectData = {
      name: item.name,
      icon: item.img,
      origin: item.uuid, // Links back to the source item in the sidebar
      duration: { },   // An empty duration means it's permanent until removed
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
    
     // 2. Create the Active Effect directly on the actor.
    await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    console.log("Palladium | Active Effect should now be on the actor.");

    // --- ADD THIS NEW BLOCK ---
    // 3. Check for and apply a core status effect if one was selected.
    const statusId = item.system.statusEffect;
    if (statusId) {
      const status = CONFIG.statusEffects.find(e => e.id === statusId);
      if (status) {
        // Apply the effect to all of this actor's tokens on the current scene
        for (const token of this.actor.getActiveTokens()) {
          await token.toggleEffect(status, { active: true });
          console.log(`Palladium | Applied status "${status.label}" to token ${token.name}`);
        }
      }
    }
    // --- END OF NEW BLOCK ---

    // 4. By handling it here, we stop the original "effect" item from being created on the actor.
    return;
  }

  async _onRollPerception(event) {
    event.preventDefault();
    // This correctly reads the value directly from the actor's data model.
    const perceptionValue = this.actor.system.perception.value || 0;
    const roll = new Roll(`1d20 + ${perceptionValue}`);
    await roll.evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `<h2>Perception Check</h2>`
    });
  }

  _onEditNotes(event) {
    event.preventDefault();
    this._notesEditing = true;
    this.render(false);
  }

  /** @override */
  _getEditorV2Options() {
    return foundry.utils.mergeObject(super._getEditorV2Options(), {
      "system.notes": {
        plugins: ["menu"],
        engine: "prosemirror",
        // This callback runs when the editor's save button is clicked.
        save_callback: () => {
          this._notesEditing = false;
          this.render(false);
        }
      }
    });
  }
  _onCancelNotesEdit(event) {
    event.preventDefault();
    // Simply set the editing state to false and re-render the sheet.
    this._notesEditing = false;
    this.render(false);
  }

}