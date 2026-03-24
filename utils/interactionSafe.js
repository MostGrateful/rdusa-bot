// utils/interactionSafe.js
import { MessageFlags } from "discord.js";

/**
 * Safely ACK an interaction ASAP (prevents Unknown Interaction 10062)
 * - Defer first when possible
 * - Never throws if interaction already expired or already acknowledged
 */
export async function deferFirst(interaction, { ephemeral = true } = {}) {
  try {
    // If already acknowledged, do nothing.
    if (interaction.deferred || interaction.replied) return true;

    // For chat commands + context menus:
    if (interaction.isChatInputCommand?.() || interaction.isContextMenuCommand?.()) {
      await interaction.deferReply({
        flags: ephemeral ? MessageFlags.Ephemeral : 0,
      });
      return true;
    }

    // For buttons/selects/modals you typically deferUpdate (no ephemeral concept here)
    if (interaction.isButton?.() || interaction.isAnySelectMenu?.() || interaction.isModalSubmit?.()) {
      await interaction.deferUpdate();
      return true;
    }

    // Fallback: attempt deferReply
    await interaction.deferReply({
      flags: ephemeral ? MessageFlags.Ephemeral : 0,
    });
    return true;
  } catch (err) {
    // Ignore common "already acknowledged" / "unknown interaction"
    if (err?.code === 40060 || err?.code === 10062) return false;
    console.warn("⚠️ deferFirst failed:", err?.code || err);
    return false;
  }
}

/**
 * Safely send a message as a reply/editReply/followUp.
 * - If not yet acknowledged -> reply
 * - If already deferred/replied -> editReply
 * - If editReply fails -> followUp
 * - Never crashes your bot
 */
export async function safeRespond(
  interaction,
  payload,
  { ephemeral = true, preferEdit = true } = {},
) {
  const data = { ...payload };

  // Convert ephemeral to flags if user used it
  if (data.ephemeral !== undefined) {
    // If someone passes ephemeral, translate it
    const wantEph = Boolean(data.ephemeral);
    delete data.ephemeral;
    data.flags = wantEph ? MessageFlags.Ephemeral : 0;
  } else if (data.flags === undefined) {
    data.flags = ephemeral ? MessageFlags.Ephemeral : 0;
  }

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply(data);
      return "reply";
    }

    if (preferEdit) {
      await interaction.editReply(data);
      return "editReply";
    }

    await interaction.followUp(data);
    return "followUp";
  } catch (err) {
    // Interaction expired: stop silently
    if (err?.code === 10062) return "expired";

    // "Already acknowledged" can happen if something else replied first
    if (err?.code === 40060) {
      try {
        await interaction.followUp(data);
        return "followUp";
      } catch (e2) {
        if (e2?.code === 10062) return "expired";
        console.warn("⚠️ safeRespond followUp failed:", e2?.code || e2);
        return "failed";
      }
    }

    console.warn("⚠️ safeRespond failed:", err?.code || err);
    return "failed";
  }
}

/**
 * Safe helper to send a public message to the channel (never crashes).
 * Useful when you want results visible to everyone.
 */
export async function safeChannelSend(interaction, payload) {
  try {
    const ch = interaction.channel;
    if (!ch) return null;
    return await ch.send(payload);
  } catch (err) {
    console.warn("⚠️ safeChannelSend failed:", err?.code || err);
    return null;
  }
}

/**
 * Helper to check if we can attach files (Discord supports images via attachments)
 */
export function normalizeEvidenceAttachments(evidence) {
  // evidence can be:
  // - array of attachment urls
  // - array of Attachment objects
  // - single string url
  if (!evidence) return [];
  if (Array.isArray(evidence)) return evidence.filter(Boolean);
  return [evidence].filter(Boolean);
}
