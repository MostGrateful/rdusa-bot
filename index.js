import { Client, GatewayIntentBits, Collection } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const { command } = await import(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});


client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: '❌ There was an error executing that command.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
