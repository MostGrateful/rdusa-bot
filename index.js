import { Client, GatewayIntentBits, Collection, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import { checkExpiredBlacklists } from "./utils/trelloExpiryManager.js";
import { logIncident } from "./utils/raidLogger.js";

dotenv.config();

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
  const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"));

  for (const file of eventFiles) {
    const { default: event } = await import(`file://${path.join(eventsPath, file)}`);
    if (!event || !event.name) {
      console.warn(`⚠️ Skipping invalid event file: ${file}`);
      continue;
    }

    if (event.once)
      client.once(event.name, (...args) => event.execute(...args, client));
    else
      client.on(event.name, (...args) => event.execute(...args, client));

    console.log(`🟢 Loaded event: ${event.name}`);
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
    await devLogChannel.send({ embeds: [startupEmbed] });
  }

  console.log("🕓 Starting Trello blacklist expiry checker...");
  setInterval(() => checkExpiredBlacklists(client), 1000 * 60 * 60);
  await checkExpiredBlacklists(client);
});

// ───────────────────────────────
// 🚫 Global Blacklist Check (Trello-based)
// ───────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const { TRELLO_API_KEY, TRELLO_TOKEN } = process.env;
    const BOARD_ID = "iD9Bu3c1";
    const LIST_NAME = "Blacklisted Users";

    const listsRes = await fetch(
      `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const lists = await listsRes.json();
    const blacklistList = lists.find((l) => l.name.toLowerCase() === LIST_NAME.toLowerCase());
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

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    const startTime = Date.now();
    await command.execute(interaction);
    const latency = Date.now() - startTime;

    console.log(`✅ ${interaction.user.tag} used /${interaction.commandName}`);

    const optionsUsed =
      interaction.options.data.length > 0
        ? interaction.options.data.map((opt) => `• **${opt.name}:** ${opt.value ?? "N/A"}`).join("\n")
        : "None";

    const logEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Command Executed Successfully")
      .addFields(
        { name: "Command", value: `/${interaction.commandName}` },
        { name: "User", value: `${interaction.user.tag} (<@${interaction.user.id}>)` },
        { name: "Options", value: optionsUsed },
        { name: "Guild", value: `${interaction.guild?.name || "Direct Message"} (${interaction.guild?.id || "N/A"})` },
        { name: "Execution Time", value: `${latency} ms`, inline: true },
        { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: "RDUSA Bot Logging System" })
      .setTimestamp();

    const mainLog = await client.channels.fetch(process.env.LOG_CHANNEL_ID_MAIN).catch(() => null);
    if (mainLog) await mainLog.send({ embeds: [logEmbed] });

    const devLog = await client.channels.fetch(process.env.LOG_CHANNEL_ID_DEV).catch(() => null);
    if (devLog) await devLog.send({ embeds: [logEmbed] });
  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ There was an error executing that command.",
        flags: 64,
      });
    }

    const errorEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("❌ Command Execution Failed")
      .addFields(
        { name: "Command", value: `/${interaction.commandName}` },
        { name: "User", value: `${interaction.user.tag} (<@${interaction.user.id}>)` },
        { name: "Error Message", value: `\`\`\`${error.message || error}\`\`\`` },
        { name: "Timestamp", value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: "RDUSA Bot Logging System" })
      .setTimestamp();

    const devErrorChannel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
    if (devErrorChannel) {
      await devErrorChannel.send({
        content: `<@238058962711216130> 🚨 Command error detected`,
        embeds: [errorEmbed],
      });
    }
  }
});

// ───────────────────────────────
// ⚠️ Global Error Handlers
// ───────────────────────────────
process.on("unhandledRejection", async (error) => {
  if (error?.code === 10062 || (error?.rawError && error.rawError.code === 10062)) {
    console.warn("⚠️ Ignored expired Discord interaction (code 10062).");
    return;
  }

  console.error("❌ Unhandled Promise Rejection:", error);
  const channel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔴 Unhandled Promise Rejection")
      .setDescription(`\`\`\`${error.message || error}\`\`\``)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
});

process.on("uncaughtException", async (error) => {
  if (error?.code === 10062 || (error?.rawError && error.rawError.code === 10062)) {
    console.warn("⚠️ Ignored uncaught expired interaction (code 10062).");
    return;
  }

  console.error("💥 Uncaught Exception:", error);
  const channel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("💥 Uncaught Exception")
      .setDescription(`\`\`\`${error.message || error}\`\`\``)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
});

process.on("warning", async (warning) => {
  console.warn("⚠️ Warning:", warning);
  const channel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("🟡 Node.js Warning")
      .setDescription(`\`\`\`${warning.message}\`\`\``)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
});

// ───────────────────────────────
// 🚀 Login
// ───────────────────────────────
client.login(process.env.TOKEN);
