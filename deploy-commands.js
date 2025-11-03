import fs from "fs";
import path from "path";
import { REST, Routes } from "discord.js";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

// Load environment variables
const { TOKEN, CLIENT_ID } = process.env;

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Missing TOKEN or CLIENT_ID in .env file.");
  process.exit(1);
}

// Setup for reading files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, "commands");

console.log("🧭 Scanning command folders...");

// Recursive command loader
async function loadCommands(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);

    if (file.isDirectory()) {
      // Only scan subfolders inside /commands
      if (filePath.includes("commands")) {
        await loadCommands(filePath);
      }
      continue;
    }

    // Process only .js files
    if (file.name.endsWith(".js")) {
      try {
        const { default: command } = await import(`file://${filePath}`);

        // Validate structure
        if (command?.data && command?.execute) {
          commands.push(command.data.toJSON());
          console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
          console.warn(`⚠️ Skipped invalid command file: ${file.name}`);
        }
      } catch (err) {
        console.error(`❌ Failed to load ${file.name}: ${err.message}`);
      }
    }
  }
}

// Run the loader
await loadCommands(commandsPath);

// Deploy to Discord
if (commands.length === 0) {
  console.warn("⚠️ No valid commands found. Aborting deployment.");
  process.exit(0);
}

console.log(`📤 Deploying ${commands.length} commands to Discord...`);

const rest = new REST({ version: "10" }).setToken(TOKEN);

try {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log(`✅ Successfully deployed ${commands.length} commands.`);
} catch (error) {
  console.error("❌ Failed to deploy commands:", error);
}
