// utils/raidLogger.js
import fs from "fs";
import path from "path";
import { EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const DEV_LOG_CHANNEL_ID = process.env.DEV_LOG_CHANNEL_ID;

// Ensure data directory and raids.json exist
const dataDir = path.resolve("./data");
const filePath = path.join(dataDir, "raids.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log("📁 Created /data directory");
}
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, "[]");
  console.log("📄 Created raids.json");
}

/**
 * Log a new raid incident to JSON and optionally to Discord.
 */
export function logIncident(entry, client = null) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const record = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...entry,
      status: "active",
    };

    data.push(record);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    console.log(`🧩 Logged raid incident: ${record.type} (${record.guildName})`);

    if (client && DEV_LOG_CHANNEL_ID) {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🚨 New Raid Incident Logged")
        .setDescription(
          `**Type:** ${record.type}\n` +
          `**Guild:** ${record.guildName}\n` +
          `**Detected by:** ${record.detectedBy}\n` +
          `**Flagged Users:** ${record.count}`
        )
        .setTimestamp();

      client.channels
        .fetch(DEV_LOG_CHANNEL_ID)
        .then((c) => c?.send({ embeds: [embed] }))
        .catch(() => {});
    }
  } catch (err) {
    console.error("❌ Error logging raid incident:", err);
  }
}

/**
 * Get all stored incidents.
 */
export function getIncidents() {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("❌ Error reading raid incidents:", err);
    return [];
  }
}

/**
 * Update status of a raid incident (e.g. resolved)
 */
export function updateIncidentStatus(id, newStatus) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const index = data.findIndex((r) => r.id === id);
    if (index === -1) return false;

    data[index].status = newStatus;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`✅ Updated incident ${id} → ${newStatus}`);
    return true;
  } catch (err) {
    console.error("❌ Error updating raid incident status:", err);
    return false;
  }
}
