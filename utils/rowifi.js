import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Base URL for RoWifi's v2 API
const ROWIFI_API = "https://api.rowifi.link/v2";

/**
 * 🔹 Updates a Roblox user's rank in a group via RoWifi
 * @param {string|number} groupId - Roblox group ID
 * @param {string|number} userId - Roblox user ID
 * @param {string|number} rankId - Target rank ID
 * @returns {boolean} success - Whether the rank update succeeded
 */
export async function setRank(groupId, userId, rankId) {
  try {
    const res = await fetch(`${ROWIFI_API}/groups/${groupId}/members/${userId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Key ${process.env.ROWIFI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rank: Number(rankId) }),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      console.error(`❌ RoWifi setRank Error [${res.status}]:`, errTxt);
      return false;
    }

    console.log(`✅ Successfully set rank ${rankId} for Roblox user ${userId} (Group ${groupId}).`);
    return true;
  } catch (err) {
    console.error("💥 Error setting rank via RoWifi:", err);
    return false;
  }
}

/**
 * 🔹 Forces a Discord role sync for a verified Roblox user via RoWifi
 * @param {string|number} robloxId - Roblox user ID
 * @param {string|number} guildId - Discord guild ID
 * @returns {boolean} success - Whether the sync succeeded
 */
export async function syncDiscordRoles(robloxId, guildId) {
  try {
    const res = await fetch(`${ROWIFI_API}/guilds/${guildId}/update`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${process.env.ROWIFI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roblox_id: robloxId }),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      console.error(`⚠️ RoWifi syncDiscordRoles Error [${res.status}]:`, errTxt);
      return false;
    }

    console.log(`🔁 RoWifi role sync triggered for Roblox user ${robloxId} in guild ${guildId}.`);
    return true;
  } catch (err) {
    console.error("💥 Error syncing roles via RoWifi:", err);
    return false;
  }
}

/**
 * 🔹 Verifies if a Roblox user is linked to a Discord account in RoWifi
 * @param {string|number} robloxId - Roblox user ID
 * @returns {boolean} isLinked - True if user is verified in RoWifi
 */
export async function isVerified(robloxId) {
  try {
    const res = await fetch(`${ROWIFI_API}/roblox-to-discord/${robloxId}`, {
      headers: { "Authorization": `Key ${process.env.ROWIFI_API_KEY}` },
    });

    if (res.status === 404) {
      console.warn(`⚠️ Roblox ID ${robloxId} is not verified in RoWifi.`);
      return false;
    }

    if (!res.ok) {
      const errTxt = await res.text();
      console.error(`❌ RoWifi verification check failed [${res.status}]:`, errTxt);
      return false;
    }

    console.log(`✅ Roblox ID ${robloxId} is verified in RoWifi.`);
    return true;
  } catch (err) {
    console.error("💥 Error verifying RoWifi link:", err);
    return false;
  }
}
