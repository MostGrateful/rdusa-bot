// utils/raidActions.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} from "discord.js";

/* ──────────────────────────────────────────────
   👮‍♂️ Permission Check
────────────────────────────────────────────── */
export function canManageRaid(member) {
  if (!member) return false;
  const allowedRoles = [
    "1332198672720723988", // High Command
    "1414494108168487005", // Low Rank
  ];
  return (
    member.roles.cache.some(r => allowedRoles.includes(r.id)) ||
    member.user.id === "1332198672720723988" // Bot Developer
  );
}

/* ──────────────────────────────────────────────
   🚨 Send Raid Alert Embed
────────────────────────────────────────────── */
export async function sendRaidAlertEmbed(guild, type, flaggedUsers = [], client = null) {
  try {
    const channel = await guild.channels.fetch("1434698676629930085").catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🚨 Raid Detected")
      .setDescription(
        `**Type:** ${type}\n**Flagged Users:** ${flaggedUsers.length}\n\nAwaiting staff review.`
      )
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("raid_approve")
        .setLabel("Approve / Take Action")
        .setEmoji("🟢")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("raid_dismiss")
        .setLabel("Dismiss Alert")
        .setEmoji("🟡")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("raid_lockdown")
        .setLabel("Lockdown")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("raid_liftlock")
        .setLabel("Lift Lockdown")
        .setEmoji("🔓")
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      content: `<@&1332198672720723988> <@&1414494108168487005> — **Raid alert triggered. Review required.**`,
      embeds: [embed],
      components: [buttons],
    });

    if (client && process.env.DEV_LOG_CHANNEL_ID) {
      const dev = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
      if (dev) await dev.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ Error sending raid alert embed:", err);
  }
}

/* ──────────────────────────────────────────────
   🔒 Apply Lockdown
────────────────────────────────────────────── */
export async function applyLockdown(guild, reason = "Lockdown initiated") {
  const affected = [];
  try {
    for (const [id, channel] of guild.channels.cache) {
      if (channel.type === ChannelType.GuildText) {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        affected.push(channel.name);
      }
    }

    const logChannel = await guild.channels.fetch("1434698676629930085").catch(() => null);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔒 Server Lockdown")
        .setDescription(`All text channels locked.\n**Reason:** ${reason}`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ Failed to apply lockdown:", err);
  }
  return affected;
}

/* ──────────────────────────────────────────────
   🔓 Remove Lockdown
────────────────────────────────────────────── */
export async function removeLockdown(guild, liftedBy = "System") {
  const affected = [];
  try {
    for (const [id, channel] of guild.channels.cache) {
      if (channel.type === ChannelType.GuildText) {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
        affected.push(channel.name);
      }
    }

    const logChannel = await guild.channels.fetch("1434698676629930085").catch(() => null);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Lockdown Lifted")
        .setDescription(`Text channels reopened.\n**Lifted By:** ${liftedBy}`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ Failed to remove lockdown:", err);
  }
  return affected;
}

/* ──────────────────────────────────────────────
   🪟 Show Lockdown Modal
────────────────────────────────────────────── */
export async function showLockdownModal(interaction) {
  try {
    const modal = new ModalBuilder()
      .setCustomId("lockdown_modal")
      .setTitle("Initiate Server Lockdown");

    const reasonInput = new TextInputBuilder()
      .setCustomId("lockdown_reason")
      .setLabel("Reason for lockdown")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Example: Raid detected — mass joins")
      .setRequired(true);

    const durationInput = new TextInputBuilder()
      .setCustomId("lockdown_duration")
      .setLabel("Estimated duration (optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g., 15m, 1h, 1d");

    const row1 = new ActionRowBuilder().addComponents(reasonInput);
    const row2 = new ActionRowBuilder().addComponents(durationInput);
    modal.addComponents(row1, row2);

    await interaction.showModal(modal);
  } catch (err) {
    console.error("❌ Failed to show lockdown modal:", err);
  }
}

/* ──────────────────────────────────────────────
   ⚙️ Take Action on Raid
────────────────────────────────────────────── */
export async function takeActionOnRaid(interaction, actionType = "review") {
  try {
    const staff = interaction.user.tag;
    const guild = interaction.guild;
    const channel = interaction.channel;

    let color = 0xfee75c;
    let title = "Raid Action Taken";
    let desc = "";

    switch (actionType) {
      case "approve":
        color = 0x57f287;
        title = "🟢 Raid Action Approved";
        desc = `Approved by **${staff}** — proceeding with appropriate measures.`;
        break;
      case "dismiss":
        color = 0xfee75c;
        title = "🟡 Raid Dismissed";
        desc = `Dismissed by **${staff}** — determined to be non-malicious.`;
        break;
      case "kick":
        color = 0xed4245;
        title = "🔨 Raid Members Kicked";
        desc = `Approved by **${staff}** — flagged accounts were kicked.`;
        break;
      case "ban":
        color = 0xed4245;
        title = "🚫 Raid Members Banned";
        desc = `Approved by **${staff}** — flagged accounts were banned.`;
        break;
      default:
        desc = `Reviewed by **${staff}**.`;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(desc)
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Optional developer log
    if (process.env.DEV_LOG_CHANNEL_ID) {
      const devChannel = await guild.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
      if (devChannel) await devChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ Failed to take raid action:", err);
  }
}
