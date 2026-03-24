// commands/admin/broadcastdo.js
import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { getBroadcastDoPingRoles } from "../../utils/getBroadcastDoPingRoles.js";

// Uses the image you provided (Department of Defense seal)
const DEFAULT_AVATAR_URL = "https://i.ibb.co/bjsKqGyT/USM.webp";

// Permission gate table:
// guild_broadcastdo_perms(guild_id, role_id, enabled)
async function userCanBroadcast(db, guildId, member) {
  if (!db || !guildId || !member) return false;

  // Admins always allowed
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;

  try {
    const [rows] = await db.query(
      "SELECT role_id FROM guild_broadcastdo_perms WHERE guild_id = ? AND enabled = 1",
      [guildId],
    );

    const allowedRoleIds = (rows || []).map((r) => String(r.role_id)).filter(Boolean);
    if (!allowedRoleIds.length) return false;

    return member.roles.cache.some((r) => allowedRoleIds.includes(r.id));
  } catch (e) {
    console.error("❌ broadcastdo perms SQL error:", e);
    return false;
  }
}

function normalizeImageUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // If user pasted something without protocol, try to fix it
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return `https://${raw}`;
  }
  return raw;
}

export default {
  data: new SlashCommandBuilder()
    .setName("broadcastdo")
    .setDescription("Broadcast an official message to all configured servers.")
    .setDMPermission(false),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction
   * @param {import("discord.js").Client} client
   */
  async execute(interaction, client) {
    const modal = new ModalBuilder()
      .setCustomId("broadcastdo_modal")
      .setTitle("Department of Defense Broadcast");

    const titleInput = new TextInputBuilder()
      .setCustomId("bdo_title")
      .setLabel("Title")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g., Update to Fleet Operations")
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId("bdo_desc")
      .setLabel("Description")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Type your message here...")
      .setRequired(true);

    const imageInput = new TextInputBuilder()
      .setCustomId("bdo_image")
      .setLabel("Image URL (optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://... (leave blank for none)")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(imageInput),
    );

    return interaction.showModal(modal);
  },
};

// ───────────────────────────────
// Modal Handler
// ───────────────────────────────
export async function handleBroadcastDoModal(interaction, client) {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId !== "broadcastdo_modal") return;

  const db = client.db;

  await interaction.deferReply({ flags: 64 });

  if (!interaction.inGuild() || !interaction.guild) {
    return interaction.editReply("❌ This can only be used in a server.");
  }

  if (!db) {
    return interaction.editReply("❌ Database not available.");
  }

  const guildId = interaction.guild.id;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return interaction.editReply("❌ Could not load your member profile.");

  // Permission gate (SQL roles OR admin)
  const allowed = await userCanBroadcast(db, guildId, member);
  if (!allowed) return interaction.editReply("🚫 You are not authorized to use this command.");

  const title = interaction.fields.getTextInputValue("bdo_title")?.trim();
  const desc = interaction.fields.getTextInputValue("bdo_desc")?.trim();
  const imageUrl = normalizeImageUrl(interaction.fields.getTextInputValue("bdo_image"));

  if (!title || !desc) return interaction.editReply("❌ Title and description are required.");

  // Get all guilds that configured a broadcast channel
  // Table expected: guild_broadcastdo_config(guild_id, channel_id, enabled, updated_by, updated_at)
  let configs = [];
  try {
    const [rows] = await db.query(
      "SELECT guild_id, channel_id FROM guild_broadcastdo_config WHERE enabled = 1",
    );
    configs = rows || [];
  } catch (e) {
    console.error("❌ broadcastdo config SQL error:", e);
    return interaction.editReply("❌ Could not load broadcast configuration from the database.");
  }

  if (!configs.length) {
    return interaction.editReply("⚠️ No servers have configured a broadcast channel yet.");
  }

  // Embed
  const embed = new EmbedBuilder()
    .setColor(0x0b3d91) // DoD blue
    .setAuthor({ name: "Department of Defense", iconURL: DEFAULT_AVATAR_URL })
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: `${interaction.user.tag} • ${new Date().toLocaleString()}` })
    .setTimestamp();

  if (imageUrl) embed.setImage(imageUrl);

  let sentCount = 0;
  let skippedCount = 0;
  const skipped = [];

  for (const cfg of configs) {
    const targetGuildId = String(cfg.guild_id);
    const channelId = String(cfg.channel_id);

    // ✅ FIX: fetch guild if not in cache (prevents “skipping”)
    const guild =
      client.guilds.cache.get(targetGuildId) ??
      (await client.guilds.fetch(targetGuildId).catch(() => null));

    if (!guild) {
      skippedCount++;
      skipped.push(`${targetGuildId} (bot not in guild / cannot fetch)`);
      continue;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      skippedCount++;
      skipped.push(`${guild.name} (channel missing/not text)`);
      continue;
    }

    // Fetch ping roles for THIS guild (0..N)
    const roleIds = await getBroadcastDoPingRoles(db, targetGuildId);

    // Only mention roles that exist in this guild
    const validRoleIds = roleIds.filter((rid) => guild.roles.cache.has(rid));
    const mentionText = validRoleIds.length ? validRoleIds.map((rid) => `<@&${rid}>`).join(" ") : "";

    try {
      await channel.send({
        content: mentionText || undefined,
        embeds: [embed],
        allowedMentions: { roles: validRoleIds },
      });
      sentCount++;
    } catch (e) {
      skippedCount++;
      skipped.push(`${guild.name} (send failed)`);
      console.error(`❌ broadcastdo send failed for ${guild.name}:`, e);
    }
  }

  const lines = [
    `✅ Broadcast sent to **${sentCount}** server(s).`,
    `⚠️ Skipped **${skippedCount}** server(s).`,
  ];

  if (skipped.length) {
    const preview = skipped.slice(0, 10).join("\n");
    lines.push("", "**Skipped (first 10):**", preview);
    if (skipped.length > 10) lines.push(`...and ${skipped.length - 10} more`);
  }

  return interaction.editReply(lines.join("\n"));
}
