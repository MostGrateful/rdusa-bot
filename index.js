import {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  Partials,
} from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { checkExpiredBlacklists } from "./utils/trelloExpiryManager.js";
import { updateChainOfCommand } from "./utils/updateCoC.js";
import { startBirthdayScheduler } from "./utils/birthdayPoster.js";
import {
  handleCommissionButtons,
  handleCommissionModals,
} from "./utils/commissionRequestHandlers.js";

dotenv.config();

// ───────────────────────────────
// 🚫 Trello Global Blacklist Helpers
// ───────────────────────────────
const TRELLO_BLACKLIST_BOARD_SHORTLINK = "iD9Bu3c1";
const TRELLO_BLACKLIST_LIST_NAME = "Blacklisted Users";

const trelloBlacklistCache = new Map();
const TRELLO_BLACKLIST_CACHE_MS = 60_000;

function _norm(s) {
  return String(s || "").trim().toLowerCase();
}

async function _trelloFetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

async function getTrelloBlacklistListId() {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) return null;

  const { ok, data } = await _trelloFetchJson(
    `https://api.trello.com/1/boards/${TRELLO_BLACKLIST_BOARD_SHORTLINK}/lists?key=${key}&token=${token}`
  );
  if (!ok || !Array.isArray(data)) return null;

  const list = data.find((l) => _norm(l.name) === _norm(TRELLO_BLACKLIST_LIST_NAME));
  return list?.id || null;
}

function cardMatchesDiscordId(card, userId) {
  const id = String(userId);
  const name = String(card?.name || "");
  const desc = String(card?.desc || "");
  return name.includes(`(${id})`) || name.includes(id) || desc.includes(id);
}

function extractReasonFromDesc(desc) {
  const text = String(desc || "");
  const match = text.match(/reason:\s*(.+)/i);
  if (!match) return null;

  const reason = match[1].trim();
  if (!reason) return null;

  return reason.length > 500 ? `${reason.slice(0, 497)}...` : reason;
}

async function isUserBlacklistedTrello(userId) {
  const now = Date.now();
  const cached = trelloBlacklistCache.get(userId);
  if (cached && cached.expires > now) return cached;

  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;

  if (!key || !token) {
    const result = { blacklisted: false, reason: null, expires: now + TRELLO_BLACKLIST_CACHE_MS };
    trelloBlacklistCache.set(userId, result);
    return result;
  }

  const listId = await getTrelloBlacklistListId();
  if (!listId) {
    const result = { blacklisted: false, reason: null, expires: now + TRELLO_BLACKLIST_CACHE_MS };
    trelloBlacklistCache.set(userId, result);
    return result;
  }

  const { ok, data: cards } = await _trelloFetchJson(
    `https://api.trello.com/1/lists/${listId}/cards?key=${key}&token=${token}`
  );

  if (!ok || !Array.isArray(cards)) {
    const result = { blacklisted: false, reason: null, expires: now + TRELLO_BLACKLIST_CACHE_MS };
    trelloBlacklistCache.set(userId, result);
    return result;
  }

  const card = cards.find((c) => cardMatchesDiscordId(c, userId)) || null;

  const result = {
    blacklisted: !!card,
    reason: card ? extractReasonFromDesc(card.desc) : null,
    expires: now + TRELLO_BLACKLIST_CACHE_MS,
  };

  trelloBlacklistCache.set(userId, result);
  return result;
}

// ───────────────────────────────
// ✅ Interaction-safe helpers
// ───────────────────────────────
async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (e) {
    if (e?.code === 10062) return null;
    console.warn("⚠️ safeReply failed:", e?.code || e);
    return null;
  }
}

async function safeEdit(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch (e) {
    if (e?.code === 10062) return null;
    console.warn("⚠️ safeEdit failed:", e?.code || e);
    return null;
  }
}

async function safeDefer(interaction, opts) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply(opts);
    }
  } catch (e) {
    if (e?.code === 10062) return;
    console.warn("⚠️ safeDefer failed:", e?.code || e);
  }
}

// ───────────────────────────────
// ⚙️ Error Guards
// ───────────────────────────────
process.on("unhandledRejection", (error) => {
  console.warn("⚠️ Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.warn("⚠️ Uncaught exception:", error);
});

// ───────────────────────────────
// 🧠 Client Setup
// ───────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

// ───────────────────────────────
// 🗄️ SQL Database Connection
// ───────────────────────────────
try {
  const db = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  client.db = db;
  console.log("🗄️ MySQL Database connected successfully.");

  await db.query(`
    CREATE TABLE IF NOT EXISTS discord_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(64) NOT NULL,
      guild_id VARCHAR(32) NOT NULL,
      channel_id VARCHAR(32) NOT NULL,
      message_id VARCHAR(32) NOT NULL,
      requester_id VARCHAR(32) NOT NULL,
      target_id VARCHAR(32) NOT NULL,
      payload_json JSON NOT NULL,
      status ENUM('pending','approved','denied','cancelled') DEFAULT 'pending',
      decided_by VARCHAR(64) DEFAULT NULL,
      decision_reason TEXT DEFAULT NULL,
      decided_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_message (message_id)
    );
  `);

  console.log("🧾 discord_requests table ensured.");

  await db.query(`
    CREATE TABLE IF NOT EXISTS birthdays (
      user_id VARCHAR(32) NOT NULL,
      guild_id VARCHAR(32) NOT NULL,
      month TINYINT NOT NULL,
      day TINYINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, guild_id)
    );
  `);

  console.log("🎂 birthdays table ensured.");

  await db.query(`
    CREATE TABLE IF NOT EXISTS birthday_daily_posts (
      guild_id VARCHAR(32) NOT NULL,
      post_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, post_date)
    );
  `);

  console.log("📆 birthday_daily_posts table ensured.");

  await db.query(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
      birthday_channel_id VARCHAR(32) NULL
    );
  `);

  console.log("🏛️ guild_config table ensured.");

  try {
    await db.query(`
      ALTER TABLE guild_config
      ADD COLUMN birthday_channel_id VARCHAR(32) NULL
    `);
    console.log("➕ Added birthday_channel_id column to guild_config.");
  } catch (alterErr) {
    const msg = String(alterErr?.message || "").toLowerCase();
    if (msg.includes("duplicate column") || msg.includes("already exists")) {
      console.log("ℹ️ birthday_channel_id column already exists.");
    } else {
      console.error("❌ Failed altering guild_config for birthday_channel_id:", alterErr);
    }
  }
} catch (err) {
  console.error("❌ Failed to connect to MySQL:", err);
}

// ───────────────────────────────
// 📦 Recursive Command Loader
// ───────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadCommands(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);

    if (file.isDirectory()) {
      await loadCommands(filePath);
    } else if (file.name.endsWith(".js")) {
      try {
        const module = await import(`file://${filePath}`);
        const command = module.default;

        if (!command?.data || !command?.execute) {
          console.warn(`⚠️ Skipping invalid command file: ${file.name}`);
          continue;
        }

        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
      } catch (e) {
        console.error(`❌ Failed to load ${file.name}:`, e?.message || e);
      }
    }
  }
}

await loadCommands(path.join(__dirname, "commands"));

// ───────────────────────────────
// 📅 Event Loader
// ───────────────────────────────
async function loadEvents() {
  const eventsPath = path.join(__dirname, "events");
  if (!fs.existsSync(eventsPath)) return;

  const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
  for (const file of eventFiles) {
    const { default: event } = await import(`file://${path.join(eventsPath, file)}`);
    if (!event || !event.name) continue;

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
}

await loadEvents();

// ───────────────────────────────
// 🟢 Ready Event
// ───────────────────────────────
client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  let activityName = "RDUSA";
  let activityType = 3;
  let status = "online";

  const db = client.db;
  if (db) {
    try {
      const [rows] = await db.query(
        "SELECT bot_status_text, bot_status_type, bot_status_state FROM bot_config WHERE id = 1"
      );

      if (rows.length > 0) {
        const cfg = rows[0];
        if (cfg.bot_status_text) activityName = cfg.bot_status_text;
        if (typeof cfg.bot_status_type === "number") activityType = cfg.bot_status_type;
        if (cfg.bot_status_state) status = cfg.bot_status_state;

        console.log(
          `🎛 Loaded presence from DB: text="${activityName}", type=${activityType}, status="${status}"`
        );
      } else {
        console.warn("⚠️ bot_config row id=1 not found, using default presence.");
      }
    } catch (err) {
      console.error("❌ Failed to load bot presence from DB, using default:", err);
    }
  }

  client.user.setPresence({
    activities: [{ name: activityName, type: activityType }],
    status,
  });

  const devLogChannel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);

  if (devLogChannel) {
    const startupEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🟢 Bot Started")
      .setDescription(`**${client.user.tag}** is now online and operational.`)
      .addFields(
        { name: "Startup Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
        { name: "Servers Connected", value: `${client.guilds.cache.size}` }
      )
      .setFooter({ text: "RDUSA Bot Logging System" })
      .setTimestamp();

    await devLogChannel.send({ embeds: [startupEmbed] }).catch(() => null);
  }

  console.log("🕓 Starting Trello blacklist expiry checker...");
  setInterval(() => checkExpiredBlacklists(client), 1000 * 60 * 60);
  await checkExpiredBlacklists(client);

  console.log("🕓 Scheduling daily Chain of Command updates...");
  setInterval(() => updateChainOfCommand(client), 1000 * 60 * 60 * 24);
  await updateChainOfCommand(client);

  console.log("🎂 Starting birthday scheduler...");
  startBirthdayScheduler(client);
});

// ───────────────────────────────
// 🎛 Global Interaction Handler
// ───────────────────────────────
client.on("interactionCreate", async (interaction) => {
  const db = client.db;

  // ✅ QOTD Create/Edit Modal
  if (
    interaction.isModalSubmit() &&
    (interaction.customId === "qotd_create_modal" || interaction.customId.startsWith("qotd_edit_modal:"))
  ) {
    const { handleQOTDModal } = await import("./commands/utility/qotd.js");
    return handleQOTDModal(interaction, client);
  }

  // ✅ QOTD Buttons
  if (interaction.isButton() && interaction.customId.startsWith("qotd_")) {
    const { handleQOTDButtons } = await import("./commands/utility/qotd.js");
    return handleQOTDButtons(interaction, client);
  }

  // ✅ Suggestion Modal
  if (interaction.isModalSubmit() && interaction.customId === "suggest_modal") {
    const { handleSuggestModal } = await import("./commands/utility/suggest.js");
    return handleSuggestModal(interaction);
  }

  // ✅ Bug Report Modal
  if (interaction.isModalSubmit() && interaction.customId === "reportbug_modal") {
    const { handleBugModal } = await import("./commands/utility/reportbug.js");
    return handleBugModal(interaction);
  }

  // ✅ BroadcastDo Modal
  if (interaction.isModalSubmit() && interaction.customId === "broadcastdo_modal") {
    const { handleBroadcastDoModal } = await import("./commands/admin/broadcastdo.js");
    return handleBroadcastDoModal(interaction, client);
  }

  // ✅ Commission request buttons
  if (await handleCommissionButtons(interaction, client)) {
    return;
  }

  // ✅ Commission request modals
  if (await handleCommissionModals(interaction, client)) {
    return;
  }

  // ✅ Request Background Check Role Modal
  if (interaction.isModalSubmit() && interaction.customId === "requestBackgroundCheckRoleModal") {
    const BACKGROUND_MANAGER_CHANNEL = "1439479062572699739";
    const NORMAL_LOG_CHANNEL = "1388886528968622080";
    const DEV_LOG_CHANNEL = "1388955430318768179";

    const username = interaction.fields.getTextInputValue("bg_username");
    const armyRank = interaction.fields.getTextInputValue("bg_armyrank");
    const division = interaction.fields.getTextInputValue("bg_division");
    const divisionRank = interaction.fields.getTextInputValue("bg_divisionrank");
    const reason = interaction.fields.getTextInputValue("bg_reason");

    const embed = new EmbedBuilder()
      .setTitle("📥 Request Background Check Role")
      .setColor(0x2b6cb0)
      .addFields(
        { name: "Username", value: username, inline: true },
        { name: "Army Rank", value: armyRank, inline: true },
        { name: "Division", value: division, inline: true },
        { name: "Division Rank", value: divisionRank, inline: true },
        { name: "Reason & Division Benefit", value: reason || "No reason provided.", inline: false },
        { name: "Requested By", value: `<@${interaction.user.id}>`, inline: false }
      )
      .setTimestamp();

    try {
      const bgChannel = await interaction.client.channels.fetch(BACKGROUND_MANAGER_CHANNEL);
      if (bgChannel) {
        await bgChannel.send({
          content: "<@238058962711216130> A new **Background Check Role** request has been submitted.",
          embeds: [embed],
        });
      }
    } catch (err) {
      console.error("Error sending to Background Manager channel:", err);
    }

    try {
      const logChannel = await interaction.client.channels.fetch(NORMAL_LOG_CHANNEL);
      if (logChannel) {
        await logChannel.send({
          content: `Background Check Role request submitted by <@${interaction.user.id}>`,
          embeds: [embed],
        });
      }
    } catch (err) {
      console.error("Error sending to normal log channel:", err);
    }

    try {
      const devChannel = await interaction.client.channels.fetch(DEV_LOG_CHANNEL);
      if (devChannel) {
        await devChannel.send({
          content: `[DEV LOG] /requestbackgroundcheckrole used by ${interaction.user.tag} (${interaction.user.id})`,
          embeds: [embed],
        });
      }
    } catch (err) {
      console.error("Error sending to developer log channel:", err);
    }

    await safeReply(interaction, {
      content: "✅ Your **Background Check Role** request has been submitted.",
      flags: 64,
    });

    return;
  }

  // ✅ Edit-Embed Modal
  if (interaction.isModalSubmit() && interaction.customId.startsWith("editembed_modal:")) {
    const { handleEditEmbedModal } = await import("./commands/Management/editembed.js");
    return handleEditEmbedModal(interaction, client);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("editembed:")) {
    const { handleEditEmbedModal } = await import("./commands/Management/editembed.js");
    return handleEditEmbedModal(interaction, client);
  }

  // Existing commission revoke modal/button logic left intact below.
  // You can remove this old revoke-only logic later if the new commission handlers fully replace it.

  if (interaction.isModalSubmit() && interaction.customId.startsWith("commission_revoke_modal:")) {
    if (!db) return safeReply(interaction, { content: "❌ Database not available.", flags: 64 });

    const messageId = interaction.customId.split(":")[1];
    const denyReason = interaction.fields.getTextInputValue("deny_reason")?.trim() || "No reason provided.";

    const guildId = interaction.guild?.id;
    if (!guildId) return safeReply(interaction, { content: "❌ This can only be used in a server.", flags: 64 });

    const modalMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!modalMember) return safeReply(interaction, { content: "❌ Could not load your member profile.", flags: 64 });

    let canRevoke = false;
    try {
      const [permRows] = await db.query(
        "SELECT role_id FROM guild_commission_revoke_perms WHERE guild_id=? AND enabled=1",
        [guildId]
      );
      const allowedRoleIds = (permRows || []).map((r) => String(r.role_id)).filter(Boolean);
      canRevoke = allowedRoleIds.length
        ? modalMember.roles.cache.some((r) => allowedRoleIds.includes(r.id))
        : false;
    } catch (e) {
      console.error("❌ commission revoke perms SQL error:", e);
      canRevoke = false;
    }

    if (!canRevoke) {
      return safeReply(interaction, { content: "🚫 You are not authorized to revoke approvals.", flags: 64 });
    }

    const [rows] = await db.query(
      "SELECT * FROM discord_requests WHERE type='commission' AND message_id=? LIMIT 1",
      [messageId]
    );
    if (!rows.length) {
      return safeReply(interaction, { content: "❌ Request not found in database.", flags: 64 });
    }

    const req = rows[0];

    if (req.status !== "approved") {
      return safeReply(interaction, { content: "⚠️ This request is not approved (nothing to revoke).", flags: 64 });
    }

    await db.query(
      "UPDATE discord_requests SET status='denied', decided_by=?, decided_reason=?, decided_at=NOW() WHERE message_id=?",
      [interaction.user.id, denyReason, messageId]
    );

    const ch = await client.channels.fetch(req.channel_id).catch(() => null);
    const msg = ch ? await ch.messages.fetch(req.message_id).catch(() => null) : null;

    if (msg?.embeds?.[0]) {
      const revokedEmbed = EmbedBuilder.from(msg.embeds[0]).setColor(0xed4245);

      const fields = revokedEmbed.data.fields ?? [];
      const statusIndex = fields.findIndex((f) => f.name?.toLowerCase() === "status");
      const approvedByIndex = fields.findIndex((f) => f.name?.toLowerCase() === "approved by");

      const statusValue = `❌ Approval Revoked by ${interaction.user.tag}\n**Reason:** ${denyReason}`;

      if (statusIndex !== -1) {
        revokedEmbed.spliceFields(statusIndex, 1, { name: "Status", value: statusValue, inline: false });
      } else {
        revokedEmbed.addFields({ name: "Status", value: statusValue, inline: false });
      }

      if (approvedByIndex === -1) {
        revokedEmbed.addFields({ name: "Approved By", value: "RDUSA | Operations", inline: false });
      }

      revokedEmbed.setFooter({ text: `Revoked • ${new Date().toLocaleString()}` });

      await msg.edit({ embeds: [revokedEmbed], components: [] }).catch(() => null);
    }

    try {
      const requester = await client.users.fetch(req.requester_id).catch(() => null);
      if (requester) {
        const jump = `https://discord.com/channels/${req.guild_id}/${req.channel_id}/${req.message_id}`;
        const dmEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("❌ Commission Request Revoked")
          .setDescription(`Your commission request approval was **revoked**.\n\n**View Request:** ${jump}`)
          .addFields({ name: "Reason", value: denyReason })
          .setFooter({
            text: `User ID: ${req.target_id} • Request ID: ${req.id} • ${new Date().toLocaleString()}`,
          })
          .setTimestamp();

        await requester.send({ embeds: [dmEmbed] }).catch(() => null);
      }
    } catch (_) {}

    return safeReply(interaction, { content: "❌ Approval revoked and logged.", flags: 64 });
  }

  if (interaction.isButton() && interaction.customId.startsWith("commission_revoke:")) {
    if (!db) return safeReply(interaction, { content: "❌ Database not available.", flags: 64 });

    const parts = interaction.customId.split(":");
    const messageId = parts[1];
    if (!messageId) {
      return safeReply(interaction, { content: "❌ Invalid button payload.", flags: 64 });
    }

    const [rows] = await db.query(
      "SELECT * FROM discord_requests WHERE type='commission' AND message_id=? LIMIT 1",
      [messageId]
    );
    if (!rows.length) {
      return safeReply(interaction, { content: "❌ Request not found in database.", flags: 64 });
    }

    const req = rows[0];

    if (req.status === "denied") {
      await interaction.deferUpdate().catch(() => null);
      await interaction.message.edit({ components: [] }).catch(() => null);
      return;
    }

    if (req.status !== "approved") {
      await interaction.deferUpdate().catch(() => null);
      await interaction.message.edit({ components: [] }).catch(() => null);
      return;
    }

    const guildId = interaction.guild?.id;
    if (!guildId) return safeReply(interaction, { content: "❌ This can only be used in a server.", flags: 64 });

    const btnMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!btnMember) return safeReply(interaction, { content: "❌ Could not load your member profile.", flags: 64 });

    let canRevoke = false;
    try {
      const [permRows] = await db.query(
        "SELECT role_id FROM guild_commission_revoke_perms WHERE guild_id=? AND enabled=1",
        [guildId]
      );
      const allowedRoleIds = (permRows || []).map((r) => String(r.role_id)).filter(Boolean);
      canRevoke = allowedRoleIds.length
        ? btnMember.roles.cache.some((r) => allowedRoleIds.includes(r.id))
        : false;
    } catch (e) {
      console.error("❌ commission revoke perms SQL error:", e);
      canRevoke = false;
    }

    if (!canRevoke) {
      return safeReply(interaction, { content: "🚫 You are not authorized to revoke approvals.", flags: 64 });
    }

    const modal = new ModalBuilder()
      .setCustomId(`commission_revoke_modal:${messageId}`)
      .setTitle("Revoke Approval");

    const reasonInput = new TextInputBuilder()
      .setCustomId("deny_reason")
      .setLabel("Reason for Revoking Approval")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return interaction.showModal(modal).catch(() => null);
  }

  // ─── Slash Commands ───
  if (!interaction.isChatInputCommand()) return;

  const BOT_OWNER_ID = "238058962711216130";
  const MAINT_OVERRIDE_ROLE_ID = "1442276596558987446";

  const cmdMember =
    interaction.member ??
    (interaction.guild ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null) : null);

  const isOwner = interaction.user.id === BOT_OWNER_ID;
  const hasOverrideRole = cmdMember?.roles?.cache?.has(MAINT_OVERRIDE_ROLE_ID) ?? false;

  const isMaintenanceBypass = isOwner || hasOverrideRole;
  interaction.isMaintenanceBypass = isMaintenanceBypass;

  let maintenanceOn = false;
  try {
    if (db) {
      const [settingsRows] = await db.query("SELECT maintenance FROM bot_settings LIMIT 1;");
      const maintenanceStatus = settingsRows?.[0]?.maintenance || "off";
      maintenanceOn = maintenanceStatus === "on";
    }
  } catch (err) {
    console.error("⚠️ Maintenance mode check failed:", err);
  }

  if (maintenanceOn && !isMaintenanceBypass) {
    return safeReply(interaction, {
      content: "🛠️ The bot is currently in **maintenance mode**.\nPlease try again later.",
      flags: 64,
    });
  }

  try {
    if (!isOwner) {
      if (interaction.commandName !== "blacklist") {
        const result = await isUserBlacklistedTrello(interaction.user.id);
        if (result.blacklisted) {
          return safeReply(interaction, {
            content:
              "🚫 You are blacklisted from using this bot." +
              (result.reason ? `\n**Reason:** ${result.reason}` : ""),
            flags: 64,
          });
        }
      }
    }
  } catch (err) {
    console.error("⚠️ Global Trello blacklist check failed:", err);
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const OWNER_ONLY_COMMANDS = ["blacklist", "eval", "maintenance", "owner", "reload", "setstatus", "shutdown"];

  if (maintenanceOn && hasOverrideRole && !isOwner && OWNER_ONLY_COMMANDS.includes(interaction.commandName)) {
    return safeReply(interaction, {
      content: "🚫 This command is restricted to the bot owner, even while maintenance mode is active.",
      flags: 64,
    });
  }

  try {
    const startTime = Date.now();
    await command.execute(interaction, client);
    const latency = Date.now() - startTime;
    console.log(`✅ ${interaction.user.tag} used /${interaction.commandName} (${latency}ms)`);
  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);

    if (error?.code === 10062) return;

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ There was an error executing that command.",
          flags: 64,
        });
      } else {
        await interaction.editReply({
          content: "❌ There was an error executing that command.",
        });
      }
    } catch (replyErr) {
      console.warn("⚠️ Failed to send error response:", replyErr?.code || replyErr);
    }
  }
});

// ───────────────────────────────
// 🚀 Login
// ───────────────────────────────
client.login(process.env.TOKEN);