import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const commands = [];
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

console.log("🧭 Found command files:", commandFiles);

for (const file of commandFiles) {
  console.log(`📦 Importing: ${file}`);
  const module = await import(`./commands/${file}`);
  const command = module.default; // <-- this line is the key change

  if (!command || !command.data) {
    console.log(`⚠️  Skipping ${file} — missing export`);
    continue;
  }

  commands.push(command.data.toJSON());
  console.log(`✅ Loaded command: ${command.data.name}`);
}

if (commands.length === 0) {
  console.log("❌ No valid commands found, aborting.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔁 Deploying application (/) commands...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log(`✅ Successfully registered ${commands.length} command(s)!`);
  } catch (error) {
    console.error("❌ Error deploying commands:", error);
  }
})();

