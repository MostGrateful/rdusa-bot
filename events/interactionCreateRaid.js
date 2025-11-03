// events/interactionCreateRaid.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from "discord.js";
import {
  canManageRaid,
  applyLockdown,
  removeLockdown,
  sendRaidAlertEmbed,
  showLockdownModal,
  takeActionOnRaid,
} from "../utils/raidActions.js";
import { logIncident } from "../utils/raidLogger.js";

const RAID_ALERT_CHANNEL = "1434698676629930085";
const DEV_LOG_CHANNEL = process.env.DEV_LOG_CHANNEL_ID;

export default {
  name: "interactionCreate",
  async execute(interaction, client) {
    // 🔘 Handle button interactions only
    if (!interaction.isButton()) return;

    // ✅ Check permissions
    const member = interaction.member;
    if (!canManageRaid(member)) {
      return interaction.reply({
        content: "🚫 You are not authorized to manage raid alerts.",
        flags: 64,
      });
    }

    const [action, raidId] = interaction.customId.split("_");
    const guild = interaction.guild;

    // 🧩 Handle Lockdown Modal Confirmation
    if (interaction.customId === "confirm_lockdown") {
      await showLockdownModal(interaction);
      return;
    }

    // 🧱 Handle Modal Submission
    if (interaction.isModalSubmit() && interaction.customId === "lockdownModal") {
      const reason = interaction.fields.getTextInputValue("lockdownReason");

      await applyLockdown(guild, reason);

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Lockdown Confirmed")
        .setDescription(`**Reason:** ${reason}`)
        .setFooter({ text: `Approved by ${interaction.user.tag}` })
        .setTimestamp();

      const channel = await guild.channels.fetch(RAID_ALERT_CHANNEL).catch(() => null);
      if (channel) await channel.send({ embeds: [embed] });

      const devLog = await client.channels.fetch(DEV_LOG_CHANNEL).catch(() => null);
      if (devLog) await devLog.send({ embeds: [embed] });

      await interaction.reply({
        content: "✅ Lockdown initiated and alerts sent.",
        flags: 64,
      });

      logIncident({
        guildId: guild.id,
        guildName: guild.name,
        type: "Lockdown Initiated",
        detectedBy: interaction.user.tag,
        usersFlagged: [],
      });
      return;
    }

    // 🟩 Approve Alert
    if (action === "approve") {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Raid Alert Approved")
        .setDescription(`Approved by: **${interaction.user.tag}**`)
        .setFooter({ text: "Raid Defense System" })
        .setTimestamp();

      const channel = await guild.channels.fetch(RAID_ALERT_CHANNEL).catch(() => null);
      if (channel) await channel.send({ embeds: [embed] });

      const devLog = await client.channels.fetch(DEV_LOG_CHANNEL).catch(() => null);
      if (devLog) await devLog.send({ embeds: [embed] });

      await interaction.reply({
        content: "✅ Raid alert approved and logged.",
        flags: 64,
      });

      logIncident({
        guildId: guild.id,
        guildName: guild.name,
        type: "Raid Alert Approved",
        detectedBy: interaction.user.tag,
        usersFlagged: [],
      });
      return;
    }

    // 🟥 Dismiss Alert
    if (action === "dismiss") {
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("⚠️ Raid Alert Dismissed")
        .setDescription(`Dismissed by: **${interaction.user.tag}**`)
        .setFooter({ text: "Raid Defense System" })
        .setTimestamp();

      const channel = await guild.channels.fetch(RAID_ALERT_CHANNEL).catch(() => null);
      if (channel) await channel.send({ embeds: [embed] });

      const devLog = await client.channels.fetch(DEV_LOG_CHANNEL).catch(() => null);
      if (devLog) await devLog.send({ embeds: [embed] });

      await interaction.reply({
        content: "⚠️ Raid alert dismissed and logged.",
        flags: 64,
      });

      logIncident({
        guildId: guild.id,
        guildName: guild.name,
        type: "Raid Alert Dismissed",
        detectedBy: interaction.user.tag,
        usersFlagged: [],
      });
      return;
    }

    // 🔓 Lift Lockdown
    if (action === "liftlockdown") {
      await removeLockdown(guild, interaction.user.tag);

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Lockdown Lifted")
        .setDescription(`Lockdown lifted by: **${interaction.user.tag}**`)
        .setFooter({ text: "Raid Defense System" })
        .setTimestamp();

      const channel = await guild.channels.fetch(RAID_ALERT_CHANNEL).catch(() => null);
      if (channel) await channel.send({ embeds: [embed] });

      const devLog = await client.channels.fetch(DEV_LOG_CHANNEL).catch(() => null);
      if (devLog) await devLog.send({ embeds: [embed] });

      await interaction.reply({
        content: "🔓 Lockdown lifted successfully.",
        flags: 64,
      });

      logIncident({
        guildId: guild.id,
        guildName: guild.name,
        type: "Lockdown Lifted",
        detectedBy: interaction.user.tag,
        usersFlagged: [],
      });
      return;
    }

    // 🧨 Take Raid Action (kick/ban)
    if (action === "executeaction") {
      const flaggedUsers = []; // Optional: Pass actual flagged users if stored
      await takeActionOnRaid(client, guild, flaggedUsers, "kick", interaction.user.tag);

      await interaction.reply({
        content: "✅ Raid action executed (Kick).",
        flags: 64,
      });

      logIncident({
        guildId: guild.id,
        guildName: guild.name,
        type: "Raid Action Executed",
        detectedBy: interaction.user.tag,
        usersFlagged: flaggedUsers,
      });
    }
  },
};
