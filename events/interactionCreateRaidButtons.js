// events/interactionCreateRaidButtons.js
import { EmbedBuilder } from "discord.js";
import { applyLockdown, removeLockdown, canManageRaid } from "../utils/raidActions.js";
import { logIncident } from "../utils/raidLogger.js";

export default {
  name: "interactionCreate",
  async execute(interaction, client) {
    // 🧠 Only handle raid system buttons
    if (!interaction.isButton() || !interaction.customId.startsWith("raid_")) return;

    const { guild, customId, user } = interaction;

    // Ignore invalid guilds (e.g. DMs)
    if (!guild) return;

    // Fetch the member safely
    const member = await guild.members.fetch(user.id).catch(() => null);

    // 🕓 Timeout Guard — Ignore interactions older than 10 minutes
    const age = Date.now() - interaction.createdTimestamp;
    if (age > 10 * 60 * 1000) {
      console.warn(`⏰ Ignored raid button from ${user.tag} — interaction too old.`);
      return;
    }

    // ✅ Safely defer the update to prevent "Unknown interaction" errors
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
    } catch {
      console.warn(`⚠️ Interaction from ${user.tag} already expired — skipping.`);
      return;
    }

    // 🔒 Safe reply helper — prevents double replies or crashes
    const safeReply = async (data) => {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(data);
        } else {
          await interaction.reply(data);
        }
      } catch (err) {
        if (err.code === 10062) {
          console.warn(`⚠️ Expired raid interaction ignored (from ${user.tag}).`);
        } else {
          console.error("❌ Raid safeReply error:", err);
        }
      }
    };

    // 🚫 Permission check
    if (!canManageRaid(member)) {
      return safeReply({ content: "🚫 You are not authorized to manage raid alerts.", flags: 64 });
    }

    // 🛠️ Execute appropriate raid action
    let responseMsg = "";
    try {
      switch (customId) {
        case "raid_approve":
          responseMsg = "✅ Raid approved. Automated actions will be executed.";
          break;
        case "raid_dismiss":
          responseMsg = "🟡 Raid alert dismissed.";
          break;
        case "raid_lockdown":
          await applyLockdown(guild, "Manual lockdown by staff");
          responseMsg = "🔒 Server locked down.";
          break;
        case "raid_liftlock":
          await removeLockdown(guild, user.tag);
          responseMsg = "🔓 Lockdown lifted.";
          break;
        default:
          responseMsg = "ℹ️ Unknown raid action.";
          break;
      }

      // 🧾 Build response embed
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("⚙️ Raid Action Executed")
        .setDescription(`**Action:** ${responseMsg}\n**Moderator:** ${user.tag}`)
        .setTimestamp();

      // Send confirmation quietly
      await safeReply({ embeds: [embed], flags: 64 });

      // 📜 Log to dev channel
      const devLog = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
      if (devLog) await devLog.send({ embeds: [embed] });

      // 💾 Log structured data
      await logIncident({
        guildId: guild.id,
        guildName: guild.name,
        type: "Raid Action",
        detectedBy: user.tag,
        usersFlagged: [],
        count: 0,
      });
    } catch (err) {
      console.error("❌ Raid button handling error:", err);
      await safeReply({
        content: "❌ An error occurred while handling this raid action.",
        flags: 64,
      });
    }
  },
};
