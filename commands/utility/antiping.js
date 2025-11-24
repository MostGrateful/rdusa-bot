import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PROTECTED_USER_IDS } from "../../events/blockOwnerPing.js";

// ───────────────────────────────
// 📁 Path setup (same config as blockOwnerPing.js)
// ───────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "../../data");
const configPath = path.join(dataDir, "antiPingConfig.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(
    configPath,
    JSON.stringify({ enabled: true }, null, 2),
    "utf8"
  );
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { enabled: true };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf8");
}

export default {
  data: new SlashCommandBuilder()
    .setName("antiping")
    .setDescription("Enable, disable, or check status of protected-user anti-ping.")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("Choose what to do.")
        .setRequired(true)
        .addChoices(
          { name: "Enable", value: "enable" },
          { name: "Disable", value: "disable" },
          { name: "Status", value: "status" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    // Only protected users can run this
    if (!PROTECTED_USER_IDS.includes(interaction.user.id)) {
      return interaction.editReply(
        "🚫 You are not allowed to manage the anti-ping system."
      );
    }

    const mode = interaction.options.getString("mode");
    const config = loadConfig();

    if (mode === "status") {
      return interaction.editReply(
        config.enabled
          ? "✅ Anti-ping is currently **ENABLED**."
          : "⚪ Anti-ping is currently **DISABLED**."
      );
    }

    if (mode === "enable") {
      config.enabled = true;
      saveConfig(config);
      return interaction.editReply(
        "✅ Anti-ping has been **ENABLED**. Protected users cannot be pinged."
      );
    }

    if (mode === "disable") {
      config.enabled = false;
      saveConfig(config);
      return interaction.editReply(
        "⚪ Anti-ping has been **DISABLED**. Protected users can be pinged."
      );
    }

    return interaction.editReply("❌ Invalid mode.");
  },
};
