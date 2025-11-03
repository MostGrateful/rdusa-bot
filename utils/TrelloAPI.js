import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandPath = path.join(__dirname, "commands");

async function loadCommands(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      await loadCommands(filePath);
    } else if (file.name.endsWith(".js")) {
      try {
        const { default: command } = await import(`file://${filePath}`);
        if (command?.data && command?.execute) {
          commands.push(command.data.toJSON());
          console.log(`✅ Loaded command: ${command.data.name}`);
        } else {
          console.warn(`⚠️ Skipped invalid command file: ${file.name}`);
        }
      } catch (err) {
        console.error(`❌ Failed to load ${file.name}:`, err.message);
      }
    }
  }
}

await loadCommands(commandPath);

