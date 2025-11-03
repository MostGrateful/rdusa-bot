// utils/serverStatsTracker.js
import { EmbedBuilder } from "discord.js";

/**
 * Updates the server stats voice channels.
 * @param {Client} client The Discord client instance.
 */
export async function updateServerStats(client) {
  try {
    // Guild ID (we’ll use the first cached one)
    const guild = client.guilds.cache.first();
    if (!guild) return console.warn("⚠️ No guild found for Server Stats Tracker.");

    // Voice channel IDs
    const allMembersChannelId = "1389455038182723675";
    const membersChannelId = "1389455042699989022";
    const botsChannelId = "1389455047083167766";

    // Fetch up-to-date member list
    const members = await guild.members.fetch();
    const totalMembers = members.size;
    const botCount = members.filter((m) => m.user.bot).size;
    const humanCount = totalMembers - botCount;

    // Fetch channels
    const allMembersChannel = guild.channels.cache.get(allMembersChannelId);
    const membersChannel = guild.channels.cache.get(membersChannelId);
    const botsChannel = guild.channels.cache.get(botsChannelId);

    // Update channel names
    if (allMembersChannel && allMembersChannel.isVoiceBased()) {
      await allMembersChannel.setName(`All Members: ${totalMembers}`).catch(() => {});
    }

    if (membersChannel && membersChannel.isVoiceBased()) {
      await membersChannel.setName(`Members: ${humanCount}`).catch(() => {});
    }

    if (botsChannel && botsChannel.isVoiceBased()) {
      await botsChannel.setName(`Bots: ${botCount}`).catch(() => {});
    }

    console.log(`✅ Updated Server Stats | Total: ${totalMembers} | Humans: ${humanCount} | Bots: ${botCount}`);

    // Optional developer log
    const devLog = await client.channels
      .fetch(process.env.DEV_LOG_CHANNEL_ID)
      .catch(() => null);
    if (devLog) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("📊 Server Stats Updated")
        .setDescription(`Server member statistics have been updated.`)
        .addFields(
          { name: "All Members", value: `${totalMembers}`, inline: true },
          { name: "Members", value: `${humanCount}`, inline: true },
          { name: "Bots", value: `${botCount}`, inline: true }
        )
        .setTimestamp();

      await devLog.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ Failed to update server stats:", err);
  }
}
