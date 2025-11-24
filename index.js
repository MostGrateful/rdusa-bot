import {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { checkExpiredBlacklists } from "./utils/trelloExpiryManager.js";
import { updateChainOfCommand } from "./utils/updateCoC.js";

dotenv.config();

// ───────────────────────────────
// ⚙️ Error Guards (Prevents Crashes)
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
      const module = await import(`file://${filePath}`);
      const command = module.default;
      if (!command?.data || !command?.execute) {
        console.warn(`⚠️ Skipping invalid command file: ${file.name}`);
        continue;
      }
      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);
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
    event.once
      ? client.once(event.name, (...args) => event.execute(...args, client))
      : client.on(event.name, (...args) => event.execute(...args, client));
  }
}
await loadEvents();

// ───────────────────────────────
// 🟢 Ready Event
// ───────────────────────────────
client.once("clientReady", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: "RDUSA", type: 3 }],
    status: "online",
  });

  const devLogChannel = await client.channels
    .fetch(process.env.DEV_LOG_CHANNEL_ID)
    .catch(() => null);

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
    await devLogChannel.send({ embeds: [startupEmbed] });
  }

  console.log("🕓 Starting Trello blacklist expiry checker...");
  setInterval(() => checkExpiredBlacklists(client), 1000 * 60 * 60);
  await checkExpiredBlacklists(client);

  // 🪖 Daily Chain of Command Updater
  console.log("🕓 Scheduling daily Chain of Command updates...");
  setInterval(() => updateChainOfCommand(client), 1000 * 60 * 60 * 24);
  await updateChainOfCommand(client);
});

// ───────────────────────────────
// 🎛 Global Interaction Handler
// ───────────────────────────────
client.on("interactionCreate", async (interaction) => {
  const { TRELLO_API_KEY, TRELLO_TOKEN } = process.env;

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

  // ✅ Commission Buttons/Modals
  const APPROVED_ROLES = [
    "1332198216560541696",
    "1378460548844486776",
    "1389056453486051439",
    "1332198329899286633",
    "1332198334135275620",
    "1332198337977389088",
    "1332198340288577589",
    "1332200411586887760",
    "1332198672720723988",
    "1347449287046336563",
    "1347451565623218206",
    "1347451569372926022",
    "1347717557674573865",
    "1347721442392805396",
    "1347452419230928897",
    "1347452417595277404",
  ];

  if (interaction.isButton()) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const isAuthorized = member?.roles.cache.some((r) => APPROVED_ROLES.includes(r.id));
    if (!isAuthorized) {
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "🚫 You are not authorized to manage this request.",
            flags: 64,
          });
        } else {
          await interaction.followUp({
            content: "🚫 You are not authorized to manage this request.",
            flags: 64,
          });
        }
      } catch (err) {
        console.warn("⚠️ Safe interaction catch:", err.message);
      }
      return;
    }

    const message = interaction.message;
    const embed = message.embeds[0];

    // ✅ Approve Button
    if (interaction.customId === "commission_accept") {
      await interaction.deferUpdate().catch(() => null);
      const approvedEmbed = EmbedBuilder.from(embed)
        .setColor(0x57f287)
        .spliceFields(2, 1, { name: "Status", value: `✅ Approved by ${interaction.user.tag}` });
      await message.edit({ embeds: [approvedEmbed], components: [] });

      const cardId = embed?.footer?.text?.match(/CardID:(\w+)/)?.[1];
      if (cardId) {
        const trelloComment = `✅ Commission Approved\nBy: ${interaction.user.tag}\nDate: ${new Date().toUTCString()}`;
        await fetch(
          `https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: trelloComment }),
          }
        );
      }

      return interaction.followUp({
        content: `✅ Request approved by ${interaction.user.tag}.`,
        flags: 64,
      });
    }

    // ❌ Deny Button
    if (interaction.customId === "commission_deny") {
      const modal = new ModalBuilder()
        .setCustomId("commission_deny_modal")
        .setTitle("Deny Commission Request");
      const reasonInput = new TextInputBuilder()
        .setCustomId("deny_reason")
        .setLabel("Reason for Denial")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      return interaction.showModal(modal).catch(() => null);
    }
  }

  // ❌ Deny Modal Submission
  if (interaction.isModalSubmit() && interaction.customId === "commission_deny_modal") {
    await interaction.deferReply({ flags: 64 }).catch(() => null);
    const denyReason = interaction.fields.getTextInputValue("deny_reason");
    const message = interaction.message?.reference
      ? await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null)
      : interaction.message;
    const embed = message?.embeds?.[0];
    if (!embed) return;

    const deniedEmbed = EmbedBuilder.from(embed)
      .setColor(0xed4245)
      .spliceFields(2, 1, {
        name: "Status",
        value: `❌ Denied by ${interaction.user.tag}\n**Reason:** ${denyReason}`,
      });
    await message.edit({ embeds: [deniedEmbed], components: [] }).catch(() => null);

    const cardId = embed?.footer?.text?.match(/CardID:(\w+)/)?.[1];
    if (cardId) {
      const trelloComment = `❌ Commission Denied\nBy: ${interaction.user.tag}\nReason: ${denyReason}\nDate: ${new Date().toUTCString()}`;
      await fetch(
        `https://api.trello.com/1/cards/${cardId}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trelloComment }),
        }
      );
    }

    await interaction.editReply({
      content: `❌ Request denied by ${interaction.user.tag}.`,
    }).catch(() => null);
  }

  // ─── Slash Commands ───
  if (!interaction.isChatInputCommand()) return;

  // 🚫 Global Blacklist Check
  try {
    const BOARD_ID = "iD9Bu3c1";
    const LIST_NAME = "Blacklisted Users";
    const listsRes = await fetch(
      `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const lists = await listsRes.json();
    const blacklistList = lists.find(
      (l) => l.name.toLowerCase() === LIST_NAME.toLowerCase()
    );
    if (!blacklistList) return;
    const cardsRes = await fetch(
      `https://api.trello.com/1/lists/${blacklistList.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const cards = await cardsRes.json();
    const isBlacklisted = cards.some((c) => c.name.includes(interaction.user.id));
    if (isBlacklisted) {
      return interaction.reply({
        content: "🚫 You are blacklisted from using this bot.",
        flags: 64,
      });
    }
  } catch (err) {
    console.error("⚠️ Blacklist check failed:", err);
  }

  // ─── Command Execution ───
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    const startTime = Date.now();
    await command.execute(interaction, client);
    const latency = Date.now() - startTime;
    console.log(`✅ ${interaction.user.tag} used /${interaction.commandName} (${latency}ms)`);
  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ There was an error executing that command.",
        flags: 64,
      });
    }
  }
});

// ───────────────────────────────
// 🚀 Login
// ───────────────────────────────
client.login(process.env.TOKEN);
