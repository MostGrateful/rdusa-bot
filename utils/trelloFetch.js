// utils/trelloFetch.js
import fetch from "node-fetch";
import { EmbedBuilder } from "discord.js";

/**
 * Trello API fetch wrapper with automatic rate-limit alerts
 * @param {string} url Trello API endpoint URL
 * @param {Object} options fetch options (method, headers, body)
 * @param {Object} client Discord client for logging alerts
 */
export async function trelloFetch(url, options = {}, client) {
  try {
    const response = await fetch(url, options);

    // Detect Trello Rate Limit (HTTP 429)
    if (response.status === 429) {
      console.warn(`⚠️ Trello Rate Limit Hit: ${url}`);

      const devLogChannel = await client.channels
        .fetch(process.env.DEV_LOG_CHANNEL_ID)
        .catch(() => null);

      if (devLogChannel) {
        const embed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("⚠️ Trello API Rate Limit Detected")
          .setDescription(
            `The bot hit Trello's rate limit while accessing:\n\`${url}\`\n\nPlease wait before retrying requests.`
          )
          .addFields(
            { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:F>` },
            { name: "Action Taken", value: "All Trello requests paused temporarily (30s cooldown)." }
          )
          .setFooter({ text: "RDUSA Bot Monitoring System" })
          .setTimestamp();

        await devLogChannel.send({ embeds: [embed] });
      }

      // Optional: temporary pause to prevent flooding
      await new Promise((res) => setTimeout(res, 30_000));

      return null;
    }

    // Generic Error Handling
    if (!response.ok) {
      console.error(`❌ Trello API Error ${response.status}: ${await response.text()}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error("❌ Trello Fetch Error:", err);
    const devLogChannel = await client.channels
      .fetch(process.env.DEV_LOG_CHANNEL_ID)
      .catch(() => null);

    if (devLogChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("❌ Trello API Request Failed")
        .setDescription(`**Error:** ${err.message}\n**URL:** ${url}`)
        .setFooter({ text: "RDUSA Bot Monitoring System" })
        .setTimestamp();

      await devLogChannel.send({ embeds: [embed] });
    }

    return null;
  }
}
