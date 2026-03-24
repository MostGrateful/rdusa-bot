// events/messageDelete.js
import { EmbedBuilder } from "discord.js";
import { sendGuildLog } from "../utils/sendGuildLog.js";

function chunkLines(lines, maxChars = 900) {
  const chunks = [];
  let buf = "";

  for (const line of lines) {
    // +1 for newline
    if ((buf + line + "\n").length > maxChars) {
      if (buf.trim()) chunks.push(buf.trim());
      buf = line + "\n";
    } else {
      buf += line + "\n";
    }
  }

  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

export default {
  name: "messageDelete",

  /**
   * @param {import("discord.js").Message} message
   * @param {import("discord.js").Client} client
   */
  async execute(message, client) {
    try {
      // Ignore DMs / system
      if (!message?.guild) return;

      // Ignore bot messages (optional — remove if you want to log bot deletes too)
      if (message.author?.bot) return;

      const guildId = message.guild.id;
      const channelId = message.channel?.id;

      const authorTag = message.author?.tag ?? "Unknown";
      const authorId = message.author?.id ?? "Unknown";
      const msgId = message.id ?? "Unknown";

      const content =
        typeof message.content === "string" && message.content.trim().length
          ? message.content
          : null;

      // Attachments (images/videos/files)
      const attachments = [];
      if (message.attachments?.size) {
        for (const att of message.attachments.values()) {
          // att.url is the CDN URL
          attachments.push({
            name: att.name || "attachment",
            url: att.url,
            contentType: att.contentType || null,
            size: att.size || null,
          });
        }
      }

      // Stickers
      const stickers = [];
      if (message.stickers?.size) {
        for (const s of message.stickers.values()) {
          stickers.push(`${s.name} (${s.id})`);
        }
      }

      // Embeds (sometimes gifs/images show here depending on how it was posted)
      const embedMediaUrls = [];
      if (Array.isArray(message.embeds) && message.embeds.length) {
        for (const e of message.embeds) {
          // Discord.js embed objects can be raw-like; use safe optional chaining
          const img = e?.image?.url;
          const thumb = e?.thumbnail?.url;
          const video = e?.video?.url;

          if (img) embedMediaUrls.push(img);
          if (thumb) embedMediaUrls.push(thumb);
          if (video) embedMediaUrls.push(video);
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🗑️ Message Deleted")
        .addFields(
          { name: "User", value: `${authorTag} (${authorId})`, inline: false },
          { name: "Channel", value: channelId ? `<#${channelId}>` : "Unknown", inline: true },
          { name: "Message ID", value: msgId, inline: true },
        )
        .setTimestamp();

      if (content) {
        embed.addFields({
          name: "Content",
          value: content.length > 1024 ? content.slice(0, 1021) + "..." : content,
          inline: false,
        });
      } else {
        embed.addFields({
          name: "Content",
          value:
            message.partial
              ? "*Not available (message was not cached / partial).*"
              : "*No text content.*",
          inline: false,
        });
      }

      // Attachments field(s)
      if (attachments.length) {
        const lines = attachments.map((a, i) => {
          const metaParts = [];
          if (a.contentType) metaParts.push(a.contentType);
          if (typeof a.size === "number") metaParts.push(`${Math.round(a.size / 1024)} KB`);
          const meta = metaParts.length ? ` — *${metaParts.join(" • ")}*` : "";
          return `${i + 1}. [${a.name}](${a.url})${meta}`;
        });

        const chunks = chunkLines(lines);
        chunks.slice(0, 3).forEach((chunk, idx) => {
          embed.addFields({
            name: idx === 0 ? "Attachments" : "Attachments (cont.)",
            value: chunk,
            inline: false,
          });
        });
      }

      // Sticker field
      if (stickers.length) {
        embed.addFields({
          name: "Stickers",
          value: stickers.join(", ").slice(0, 1024),
          inline: false,
        });
      }

      // Embed media URLs (gifs/images posted as embeds)
      if (embedMediaUrls.length) {
        const unique = [...new Set(embedMediaUrls)];
        const lines = unique.map((u, i) => `${i + 1}. ${u}`);

        const chunks = chunkLines(lines);
        chunks.slice(0, 2).forEach((chunk, idx) => {
          embed.addFields({
            name: idx === 0 ? "Embed Media URLs" : "Embed Media URLs (cont.)",
            value: chunk,
            inline: false,
          });
        });
      }

      // If there’s at least one attachment that’s an image, show it as the embed image (nice for logs)
      const firstImage = attachments.find((a) => (a.contentType || "").startsWith("image/"));
      if (firstImage?.url) {
        embed.setImage(firstImage.url);
      }

      await sendGuildLog(client, guildId, { embeds: [embed] });
    } catch (err) {
      console.error("messageDelete log error:", err);
    }
  },
};
