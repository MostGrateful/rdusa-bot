import { Client, GatewayIntentBits, Collection, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.commands = new Collection();

// ───────────────────────────────
// 🔹 Recursive Command Loader
// ───────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadCommands(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);

    if (file.isDirectory()) {
      await loadCommands(filePath); // Recursively load subfolders
    } else if (file.name.endsWith('.js')) {
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

await loadCommands(path.join(__dirname, 'commands'));

// ───────────────────────────────
// 🟢 Startup Event
// ───────────────────────────────
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const devLogChannel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
  if (devLogChannel) {
    const startupEmbed = new EmbedBuilder()
      .setColor(0x57F287) // green
      .setTitle('🟢 Bot Started')
      .setDescription(`**${client.user.tag}** is now online and operational.`)
      .addFields(
        { name: 'Startup Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
        { name: 'Servers Connected', value: `${client.guilds.cache.size}` }
      )
      .setFooter({ text: 'RDUSA Bot Logging System' })
      .setTimestamp();
    await devLogChannel.send({ embeds: [startupEmbed] });
  }
});

// ───────────────────────────────
// 🔵 Slash Command Logging
// ───────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
    console.log(`✅ ${interaction.user.tag} used /${interaction.commandName}`);

    const logEmbed = new EmbedBuilder()
      .setColor(0x0099ff) // blue
      .setTitle('🔵 Command Used')
      .addFields(
        { name: 'User', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: false },
        { name: 'Command', value: `/${interaction.commandName}`, inline: true },
        { name: 'Server', value: `${interaction.guild?.name || 'DMs'}`, inline: true },
        { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: 'RDUSA Bot Logging System' })
      .setTimestamp();

    // Main log channel
    const mainLog = await client.channels.fetch(process.env.LOG_CHANNEL_ID_MAIN).catch(() => null);
    if (mainLog) await mainLog.send({ embeds: [logEmbed] });

    // Dev mirror
    const devLog = await client.channels.fetch(process.env.LOG_CHANNEL_ID_DEV).catch(() => null);
    if (devLog) await devLog.send({ embeds: [logEmbed] });

  } catch (error) {
    console.error(`❌ Error executing /${interaction.commandName}:`, error);
    await interaction.reply({ content: '❌ There was an error executing that command.', ephemeral: true });

    const devErrorChannel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
    if (devErrorChannel) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xED4245) // red
        .setTitle('🔴 Command Error')
        .setDescription(`Error occurred in \`/${interaction.commandName}\``)
        .addFields(
          { name: 'User', value: `${interaction.user.tag} (<@${interaction.user.id}>)` },
          { name: 'Server', value: `${interaction.guild?.name || 'DMs'}` },
          { name: 'Error', value: `\`\`\`${error.message || error}\`\`\`` }
        )
        .setFooter({ text: 'RDUSA Bot Logging System' })
        .setTimestamp();
      await devErrorChannel.send({ embeds: [errorEmbed] });
    }
  }
});

// ───────────────────────────────
// 🟡 Warnings & 🔴 Errors (Global)
// ───────────────────────────────
process.on('unhandledRejection', async error => {
  console.error('❌ Unhandled Promise Rejection:', error);
  const channel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🔴 Unhandled Promise Rejection')
      .setDescription(`\`\`\`${error.message || error}\`\`\``)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
});

process.on('warning', async warning => {
  console.warn('⚠️ Warning:', warning);
  const channel = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🟡 Node.js Warning')
      .setDescription(`\`\`\`${warning.message}\`\`\``)
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);

