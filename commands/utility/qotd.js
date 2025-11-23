import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ───────────────────────────────
// 📌 FILE PATH SETUP (ESM SAFE)
// ───────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ───────────────────────────────
// ⚙️ CONFIGURATION
// ───────────────────────────────
const QOTD_CHANNEL_ID = "1389009644063690975"; // QOTD Channel
const PING_ROLE_ID = "1375628530548998154";   // Role to ping
const THREAD_ROLE_ID = "1347706993204264991"; // Role allowed to talk in thread
const LOG_CHANNEL_ID = "1388955430318768179"; // Log channel

// Roles allowed to use /qotd
const ALLOWED_ROLES = [
  "1332197345403605123",
  "1369877362224664647",
  "1369065942243344464",
  "1370531377468149881",
  "1386575843488170075",
  "1370529017307988120",
  "1369066592423645244",
];

// ───────────────────────────────
// 🕒 DATA DIRECTORY & FILES
// ───────────────────────────────
const dataDir = path.join(__dirname, "../../data");
const cooldownFile = path.join(dataDir, "qotdCooldown.json");
const counterFile = path.join(dataDir, "qotdCounter.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Cooldown file
if (!fs.existsSync(cooldownFile)) {
  fs.writeFileSync(
    cooldownFile,
    JSON.stringify({ lastUsed: 0 }, null, 2)
  );
}

// Counter file – start at QOTD #77
if (!fs.existsSync(counterFile)) {
  fs.writeFileSync(
    counterFile,
    JSON.stringify({ count: 77 }, null, 2)
  );
}

// ───────────────────────────────
// 🧩 SLASH COMMAND
// ───────────────────────────────
export default {
  data: new SlashCommandBuilder()
    .setName("qotd")
    .setDescription("Post a Question of the Day to the QOTD channel.")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("The question you'd like to ask.")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // Use flags (ephemeral-style) to match your other commands
      await interaction.deferReply({ flags: 64 });

      // 🔒 Permission Check
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const allowed = member.roles.cache.some(r =>
        ALLOWED_ROLES.includes(r.id)
      );

      if (!allowed) {
        return interaction.editReply(
          "🚫 You do not have permission to use this command."
        );
      }

      // ⏰ Cooldown Check (24 hours)
      const cooldownData = JSON.parse(fs.readFileSync(cooldownFile, "utf8"));
      const now = Date.now();
      const diff = now - cooldownData.lastUsed;

      if (diff < 24 * 60 * 60 * 1000) {
        const remainingHours = 24 - diff / (1000 * 60 * 60);
        return interaction.editReply(
          `🕓 This command can only be used once every 24 hours.\nPlease wait **${remainingHours.toFixed(
            1
          )}** more hour(s).`
        );
      }

      // ✅ Passed cooldown – update timestamp
      cooldownData.lastUsed = now;
      fs.writeFileSync(
        cooldownFile,
        JSON.stringify(cooldownData, null, 2)
      );

      // 🔢 Load QOTD counter
      const counterData = JSON.parse(fs.readFileSync(counterFile, "utf8"));
      const qotdNumber = counterData.count;

      const question = interaction.options.getString("question");

      // 📨 Send QOTD Embed
      const qotdChannel = await interaction.client.channels
        .fetch(QOTD_CHANNEL_ID)
        .catch(() => null);

      if (!qotdChannel || !qotdChannel.isTextBased()) {
        return interaction.editReply("❌ Could not find the QOTD channel.");
      }

      const embed = new EmbedBuilder()
        .setColor(0x2596be)
        .setTitle(`Question of the Day — QOTD #${qotdNumber}`)
        .setDescription(question)
        .setFooter({ text: `Sent by ${interaction.user.tag}` })
        .setTimestamp();

      const qotdMessage = await qotdChannel.send({
        content: `<@&${PING_ROLE_ID}>`,
        embeds: [embed],
      });

      // 🧵 Create Discussion Thread with updated name
      const sanitizedQuestion = question.substring(0, 70); // keep thread name under limit
      const thread = await qotdMessage.startThread({
        name: `AOTD - QOTD #${qotdNumber} - ${sanitizedQuestion}`,
        autoArchiveDuration: 1440,
        reason: "AOTD Discussion Thread",
      });

      // Now that QOTD posted successfully, increment counter for next time
      counterData.count = qotdNumber + 1;
      fs.writeFileSync(
        counterFile,
        JSON.stringify(counterData, null, 2)
      );

      // Wait briefly to ensure thread permissions initialize
      await new Promise(r => setTimeout(r, 1500));

      try {
        const everyone = interaction.guild.roles.everyone;
        const discussionRole =
          interaction.guild.roles.cache.get(THREAD_ROLE_ID);

        // Restrict @everyone from sending messages
        if (everyone) {
          await thread.permissionOverwrites.edit(everyone, {
            SendMessages: false,
          });
        }

        // Allow discussion role to see + send
        if (discussionRole) {
          await thread.permissionOverwrites.edit(discussionRole, {
            SendMessages: true,
            ViewChannel: true,
          });
        }
      } catch (permErr) {
        console.warn(
          "⚠️ Failed to set thread permissions:",
          permErr?.message ?? permErr
        );
      }

      // 🗣️ Thread welcome message
      await thread.send(
        `💬 Welcome to today's QOTD discussion (QOTD #${qotdNumber})!`
      );

      // ✅ Confirmation
      await interaction.editReply(
        `✅ QOTD #${qotdNumber} posted successfully in <#${QOTD_CHANNEL_ID}>.\nA discussion thread has been created.`
      );

      // 🧾 Log Embed
      const logChannel = await interaction.client.channels
        .fetch(LOG_CHANNEL_ID)
        .catch(() => null);

      if (logChannel && logChannel.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 QOTD #${qotdNumber} Posted`)
          .addFields(
            {
              name: "Author",
              value: `${interaction.user.tag} (<@${interaction.user.id}>)`,
              inline: false,
            },
            { name: "Question", value: question, inline: false },
            { name: "Channel", value: `<#${QOTD_CHANNEL_ID}>`, inline: true },
            {
              name: "Message Link",
              value: `[View QOTD](https://discord.com/channels/${interaction.guild.id}/${qotdChannel.id}/${qotdMessage.id})`,
              inline: false,
            }
          )
          .setFooter({ text: `User ID: ${interaction.user.id}` })
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error("❌ Error executing /qotd:", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ There was an error while executing this command.",
          flags: 64,
        });
      } else {
        await interaction.editReply(
          "❌ An error occurred while running this command."
        );
      }
    }
  },
};
