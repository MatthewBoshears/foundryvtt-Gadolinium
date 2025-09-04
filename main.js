import { PalladiumActor } from "./documents/actor.js";
import { PalladiumCharacterSheet } from "./sheets/character-sheet.js";
import { PalladiumSkillSheet } from "./sheets/item/skill-sheet.js";
import { PalladiumWeaponSheet } from "./sheets/item/weapon-sheet.js";
import { PalladiumPowerSheet } from "./sheets/item/power-sheet.js";
import { PalladiumEffectSheet } from "./sheets/item/effect-sheet.js";

Hooks.once("init", async function() {
  console.log(`Palladium | Initializing System`);
  CONFIG.Actor.documentClass = PalladiumActor;
  CONFIG.Combat.initiative.formula = "1d20 + @initiative.value";

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("palladium", PalladiumCharacterSheet, {
    types: ["character", "npc"],
    makeDefault: true,
    label: "Palladium Character Sheet"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("palladium", PalladiumSkillSheet, { types: ["skill"], makeDefault: true, label: "Palladium Skill Sheet" });
  Items.registerSheet("palladium", PalladiumWeaponSheet, { types: ["weapon"], makeDefault: true, label: "Palladium Weapon Sheet" });
  Items.registerSheet("palladium", PalladiumPowerSheet, { types: ["power"], makeDefault: true, label: "Palladium Power Sheet" });
  Items.registerSheet("palladium", PalladiumEffectSheet, { types: ["effect"], makeDefault: true, label: "Palladium Effect Sheet" });
});

// NOTE: The broken Hooks.on("dropCanvasData", ...) has been completely removed.
Hooks.on("renderChatMessage", (message, html, data) => {
  const flag = message.getFlag("palladium", "rollData") || message.getFlag("palladium", "powerData") || message.getFlag("palladium", "damageData");
  if (!flag) return;

  const rollDataFlag = message.getFlag("palladium", "rollData");
  if (rollDataFlag?.targetTokenId) {
    const token = canvas.tokens.get(rollDataFlag.targetTokenId);
    if (token) {
      html.on('mouseover', () => token._onHoverIn({}, { hoverOutOthers: true }));
      html.on('mouseout', () => token._onHoverOut({}));
    }
  }

  html.on('click', 'button[data-action]', async (event) => {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;

    // Handle Power Card buttons
    if (action.startsWith("roll-power-")) {
      const selectedTokens = canvas.tokens.controlled;
      if (selectedTokens.length === 0) return ui.notifications.warn("Please select a token to roll the save.");
      const powerData = message.getFlag("palladium", "powerData");
      for (const token of selectedTokens) { await handlePowerSave(powerData, token); }
      return;
    }
    if (action === "roll-power-damage") {
      const powerData = message.getFlag("palladium", "powerData");
      await handlePowerDamageRoll(powerData);
      return;
    }
    if (action === "apply-power-damage") {
      const selectedTokens = canvas.tokens.controlled;
      if (selectedTokens.length === 0) return ui.notifications.warn("Please select token(s) to apply damage to.");
      const damageData = message.getFlag("palladium", "damageData");
      const damage = parseInt(button.dataset.damage);
      for (const token of selectedTokens) { await handlePowerDamageApply(damageData, token, damage); }
      return;
    }

    // Handle Attack Card buttons
    const rollData = message.getFlag("palladium", "rollData");
    const target = rollData ? await fromUuid(rollData.targetUuid) : null;
    if (!target) return ui.notifications.error("Target token not found!");

    if (action === "roll-damage") {
      await handleDamageRoll(rollData, target);
    } else if (action === "apply-damage") {
      const damage = parseInt(button.dataset.damage);
      await handleDamageApply(rollData, target, damage);
    } else if (action === "roll-defense") {
      const defenseType = button.dataset.defenseType;
      const dc = parseInt(button.dataset.dc);
      await handleDefenseRoll(rollData, target, defenseType, dc);
    } else if (action === "roll-direct-hp-damage") {
      const damageRoll = new Roll(rollData.damageFormula);
      await damageRoll.evaluate();
      const halfDamage = Math.max(1, Math.floor(damageRoll.total / 2));
      
      let content = await damageRoll.render();
      content += `<p>Half damage to HP is <strong>${halfDamage}</strong>.</p>
                  <div class="card-buttons">
                    <button data-action="apply-direct-hp-damage" data-damage="${halfDamage}">Apply Damage to HP</button>
                  </div>`;
      
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: target.actor }),
        flavor: `<h2>Direct HP Damage: ${rollData.weaponName}</h2>`,
        content: content,
        flags: { palladium: { rollData } } // Pass the original rollData forward
      });
    } else if (action === "apply-direct-hp-damage") {
      const damage = parseInt(button.dataset.damage);
      await handleDirectHPDamageApply(target, damage);
    }
  });
});

// ADD THIS NEW HELPER FUNCTION TO main.js (outside the hook)
async function handleDirectHPDamageApply(target, damage) {
  if (!target || !target.actor) return ui.notifications.error("Target not found!");
  const actor = target.actor;
  await actor.update({ "system.health.value": actor.system.health.value - damage });
  ChatMessage.create({
    content: `<strong>${damage}</strong> damage applied directly to ${target.name}'s HP.`,
    speaker: { alias: "Game System" }
  });
}


async function handleDamageRoll(rollData, target) {
  const damageRoll = new Roll(rollData.damageFormula, target.actor.getRollData());
  await damageRoll.evaluate();
  
  let content = await damageRoll.render();
  
  let buttons = `<div class="card-buttons">
    <button data-action="apply-damage" data-damage="${damageRoll.total}">Apply Full Damage</button>
    <button data-action="apply-damage" data-damage="${Math.floor(damageRoll.total / 2)}">Apply Half Damage</button>`;

  // --- NEW LOGIC IS HERE ---
  // If the maneuver was Proficient Ranged, add the special third button.
  if (rollData.maneuverKey === 'proficientRanged') {
    const halfDamage = Math.max(1, Math.floor(damageRoll.total / 2));
    buttons += `<button data-action="apply-direct-hp-damage" data-damage="${halfDamage}">Apply Half Damage to HP</button>`;
  }
  // --- END of NEW LOGIC ---

  buttons += `</div>`;
  content += buttons;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target.actor }),
    flavor: `<h2>Damage: ${rollData.weaponName}</h2>`,
    content: content,
    rolls: [damageRoll],
    flags: { palladium: { rollData } }
  });
}
async function handleDamageApply(rollData, target, damage) { const targetActor = target.actor; const updates = {}; let remainingDamage = damage; let damageLog = [`Applying ${damage} damage to ${target.name}...`]; const { targetType, attackRollTotal } = rollData; if (targetType === "armorHit") { damageLog.push(`- Attack hits <strong>Worn Armor</strong>.`); const wornSdc = targetActor.system.armor.wornSdc; if (wornSdc?.value > 0) { const armorDamage = Math.min(wornSdc.value, remainingDamage); updates["system.armor.wornSdc.value"] = wornSdc.value - armorDamage; damageLog.push(`- ${armorDamage} damage to armor SDC only.`); } else { damageLog.push(`- Armor has no SDC to absorb the blow!`); } } else if (targetType === "cleanHit") { damageLog.push(`- Attack is a <strong>Clean Hit!</strong>.`); const beatsNaturalAR = attackRollTotal > (targetActor.system.armor.natural ?? 0); if (!beatsNaturalAR) { damageLog.push("- Damage stopped by Natural Armor!"); } else { const charSdc = targetActor.system.sdc; if (charSdc?.value > 0 && remainingDamage > 0) { const sdcDamage = Math.min(charSdc.value, remainingDamage); updates["system.sdc.value"] = charSdc.value - sdcDamage; remainingDamage -= sdcDamage; damageLog.push(`- ${sdcDamage} damage to character SDC.`); } if (remainingDamage > 0) { const health = targetActor.system.health; const hpDamage = Math.min(health.value, remainingDamage); updates["system.health.value"] = health.value - hpDamage; damageLog.push(`- ${hpDamage} damage to HP.`); } } } if (Object.keys(updates).length > 0) await targetActor.update(updates); await ChatMessage.create({ speaker: { alias: "Game System" }, content: damageLog.join("<br>") }); }
async function handleDefenseRoll(rollData, defender, defenseType, dc) { const defenderActor = defender.actor; const defenseBonus = defenderActor.system.defenses[defenseType]?.value ?? 0; const dodgePenaltyManeuvers = ['sniper', 'proficientRanged']; let dodgePenalty = 0; let penaltyFlavor = ""; if (defenseType === 'dodge' && dodgePenaltyManeuvers.includes(rollData.maneuverKey)) { dodgePenalty = -10; penaltyFlavor = `<p><em>-10 penalty vs. Ranged Attack</em></p>`; } const roll = new Roll(`1d20 + ${defenseBonus} + ${dodgePenalty}`); await roll.evaluate(); const success = roll.total > dc; const resultText = success ? `<strong class="chat-success">SUCCESS!</strong> The attack is avoided.` : `<strong class="chat-failure">FAILURE!</strong>`; const flavorText = `<h2>${defender.name} attempts to ${defenseType}!</h2><p>Target DC: ${dc}</p>${penaltyFlavor}<hr>${resultText}`; await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: defenderActor }), flavor: flavorText, flags: { core: { classes: ["palladium"] } } }); }
async function handlePowerSave(powerData, target) { const targetActor = target.actor; const saveType = powerData.saveType; const saveBonus = targetActor.system.saves[saveType]?.value ?? 0; const saveDC = powerData.saveDC; const roll = new Roll(`1d20 + ${saveBonus}`); await roll.evaluate(); const success = roll.total >= saveDC; const resultText = success ? `<strong class="chat-success">SAVE SUCCESSFUL</strong>` : `<strong class="chat-failure">SAVE FAILED</strong>`; const flavorText = `<h2>${target.name} saves vs. ${powerData.powerName}</h2><p>Target DC: ${saveDC}</p><hr>${resultText}`; await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: flavorText }); }
async function handlePowerDamageRoll(powerData) { if (!powerData.damageFormula) return; const damageRoll = new Roll(powerData.damageFormula); await damageRoll.evaluate(); let content = await damageRoll.render(); content += `<div class="card-buttons"><button data-action="apply-power-damage" data-damage="${damageRoll.total}">Apply Full Damage</button><button data-action="apply-power-damage" data-damage="${Math.floor(damageRoll.total / 2)}">Apply Half Damage</button></div>`; await ChatMessage.create({ flavor: `<h2>Damage: ${powerData.powerName}</h2>`, content: content, rolls: [damageRoll], flags: { palladium: { damageData: { damageTotal: damageRoll.total } } } }); }
async function handlePowerDamageApply(damageData, target, damage) { const targetActor = target.actor; const updates = {}; let remainingDamage = damage; let damageLog = [`Applying ${damage} power damage to ${target.name}...`]; const wornSdc = targetActor.system.armor.wornSdc; if (wornSdc?.value > 0) { const armorDamage = Math.min(wornSdc.value, remainingDamage); updates["system.armor.wornSdc.value"] = wornSdc.value - armorDamage; remainingDamage -= armorDamage; damageLog.push(`- ${armorDamage} damage to armor SDC.`); } if (remainingDamage > 0) { const charSdc = targetActor.system.sdc; if (charSdc?.value > 0) { const sdcDamage = Math.min(charSdc.value, remainingDamage); updates["system.sdc.value"] = charSdc.value - sdcDamage; remainingDamage -= sdcDamage; damageLog.push(`- ${sdcDamage} damage to character SDC.`); } if (remainingDamage > 0) { const health = targetActor.system.health; const hpDamage = Math.min(health.value, remainingDamage); updates["system.health.value"] = health.value - hpDamage; damageLog.push(`- ${hpDamage} damage to HP.`); } } if (Object.keys(updates).length > 0) await targetActor.update(updates); await ChatMessage.create({ speaker: { alias: "Game System" }, content: damageLog.join("<br>") }); }
async function handleDirectHPDamage(rollData, target) { const targetActor = target.actor; const damageRoll = new Roll(rollData.damageFormula, targetActor.getRollData()); await damageRoll.evaluate(); const halfDamage = Math.floor(damageRoll.total / 2); if (halfDamage < 1) { ui.notifications.info("Half damage was less than 1, no HP damage taken."); return; } const currentHP = targetActor.system.health.value; await targetActor.update({ "system.health.value": currentHP - halfDamage }); let content = await damageRoll.render(); content += `<p><strong>${halfDamage}</strong> damage applied directly to HP, bypassing SDC.</p>`; await ChatMessage.create({ speaker: { alias: "Damage" }, flavor: `<h2>Direct HP Damage vs. ${target.name}</h2>`, content: content, rolls: [damageRoll] }); }
/**
 * This hook is the master controller for the entire combat flow.
 */
/**
 * This hook manages the turn-by-turn flow and now waits if a re-roll is in progress.
 */
Hooks.on("updateCombat", async (combat, changed, options, userId) => {
  // --- NEW: If initiative is being re-rolled, stop all processing immediately. ---
  if (combat.getFlag("palladium", "isRerolling")) return;
  
  // We only care when the turn has changed.
  if (changed.turn === undefined) return;
  // Prevent other race conditions from rapid turn clicks.
  if (combat.getFlag("palladium", "isProcessingTurn")) return;

  try {
    await combat.setFlag("palladium", "isProcessingTurn", true);

    const allOutOfActions = combat.combatants.contents.every(
      c => (c.actor?.system.actions.value ?? 1) <= 0
    );

    if (allOutOfActions) {
      ChatMessage.create({
        content: "All combatants are out of actions! Resetting for a new exchange.",
        speaker: { alias: "Game System" }
      });
      for (const combatant of combat.combatants) {
        if (combatant.actor) await combatant.actor.update({'system.actions.value': combatant.actor.system.actions.max});
      }
      await combat.nextRound();
      return; 
    }

    const combatant = combat.turns[combat.turn];
    if (!combatant || !combatant.actor) return;
    
    const actions = combatant.actor.system.actions.value;

    if (actions <= 0) {
      ChatMessage.create({
        content: `${combatant.actor.name}'s turn is skipped because they have no actions remaining.`,
        speaker: ChatMessage.getSpeaker({ actor: combatant.actor })
      });
      
      await combat.unsetFlag("palladium", "isProcessingTurn");
      await combat.nextTurn();
      return;
    }

    ChatMessage.create({
      content: `${combatant.actor.name} starts their turn with <strong>${actions}</strong> actions.`,
      speaker: ChatMessage.getSpeaker({ actor: combatant.actor })
    });

  } finally {
    if (combat.getFlag("palladium", "isProcessingTurn")) {
      await combat.unsetFlag("palladium", "isProcessingTurn");
    }
  }
});
/**
 * This hook's ONLY job is to re-roll initiative when a new round starts.
 * It now uses a 'lock' to prevent other hooks from interfering during the roll.
 */
/**
 * This hook now handles ALL start-of-round logic, including the initial turn skip.
 */
Hooks.on("combatRound", async (combat, updateData, updateOptions) => {
  // We only care when the round number itself changes.
  if (updateData.round) {
    console.log(`Palladium | New round ${updateData.round}. Re-rolling initiative!`);

    // 1. Re-roll initiative and re-sort the turn order.
    const ids = combat.combatants.map(c => c.id);
    await combat.rollInitiative(ids, { reroll: true });
    await combat.setupTurns();
    
    ChatMessage.create({
      content: `<h3>Round ${updateData.round}</h3><p>Initiative has been re-rolled.</p>`,
      speaker: { alias: "Game System" }
    });
    
    // 2. Set the turn to the top of the new order.
    await combat.update({ turn: 0 });

    // --- THE FIX IS HERE ---
    // 3. Pause for a fraction of a second to prevent race conditions.
    // This gives the combat tracker time to fully update before we proceed.
    await new Promise(r => setTimeout(r, 100));

    // 4. Now that the turn order is stable, find the first valid turn of the new round.
    let currentCombatant = game.combat.turns[game.combat.turn];
    // This loop will fast-forward past any combatants who start the round with 0 actions.
    while (currentCombatant && (currentCombatant.actor?.system.actions.value ?? 1) <= 0) {
      const actor = currentCombatant.actor;
      ChatMessage.create({
        content: `${actor.name}'s turn is skipped at the start of the round (0 actions).`,
        speaker: ChatMessage.getSpeaker({ actor: actor })
      });
      // This will trigger the simple updateCombat hook to process the *next* turn.
      await game.combat.nextTurn();
      // Re-fetch the current combatant for the next loop check.
      currentCombatant = game.combat.turns[game.combat.turn];
    }
  }
});