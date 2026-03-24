// commands/utility/accountinfo.js
// Public command: Roblox account info + RDUSA rank + last promotion & demotion + PRIMARY division
// RDUSA Group: https://www.roblox.com/communities/35514277/RDUSA-United-States-Navy#!/about
//
// PRIMARY DIVISION RULE (simple + consistent):
// - Look at ALL divisions (ally groups of RDUSA) the user is in
// - Pick the one with the HIGHEST division role rank (role.rank)
// - Tie-breaker: alphabetically by division group name
//
// If the user is [O9] Judge Advocate General or higher in RDUSA, DO NOT list divisions.
//
// Optional .env:
//   PROMOTION_LOG_CHANNEL_ID=1388886548434518016

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const RDUSA_GROUP_ID = 35514277;
const PROMOTION_LOG_CHANNEL_ID =
  process.env.PROMOTION_LOG_CHANNEL_ID || "1388886548434518016";

const MAX_MESSAGES_TO_SCAN = 800;
const PAGE_SIZE = 100;

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

async function lookupRobloxUser(username) {
  const { ok, data } = await fetchJson("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });

  if (!ok || !data?.data?.length) return null;
  return data.data[0]; // { id, name, displayName }
}

async function fetchRobloxProfile(userId) {
  const { ok, data } = await fetchJson(`https://users.roblox.com/v1/users/${userId}`);
  if (!ok) return null;
  return data; // includes created
}

async function fetchUserGroupsAndRoles(userId) {
  const { ok, data } = await fetchJson(
    `https://groups.roblox.com/v2/users/${userId}/groups/roles`
  );
  if (!ok || !Array.isArray(data?.data)) return [];
  return data.data;
}

function parseOfficerLevel(roleName) {
  const m = String(roleName || "").match(/\[O(\d+)\]/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function isJAGOrHigher(roleName) {
  const lvl = parseOfficerLevel(roleName);
  return !!lvl && lvl >= 9;
}

async function fetchAlliedGroupIds(groupId) {
  const ids = [];
  let cursor = null;

  for (let i = 0; i < 10; i++) {
    const url =
      `https://groups.roblox.com/v1/groups/${groupId}/relationships/allies` +
      `?limit=100&sortOrder=Asc` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");

    const { ok, data } = await fetchJson(url);
    if (!ok || !data) break;

    const page = Array.isArray(data?.data) ? data.data : [];
    for (const rel of page) {
      const allyGroupId =
        rel?.id ?? rel?.group?.id ?? rel?.relatedEntity?.id ?? rel?.relatedGroup?.id;
      if (typeof allyGroupId === "number") ids.push(allyGroupId);
    }

    cursor = data?.nextPageCursor || null;
    if (!cursor) break;
  }

  return [...new Set(ids)];
}

function messageMatchesEvent(msg, username, userId, type) {
  const u = norm(username);
  const idStr = String(userId);

  const keywords =
    type === "demotion"
      ? ["demote", "demoted", "removed", "rank down", "deranked"]
      : ["promote", "promoted", "rank up", "promoted to", "promoted you"];

  const content = norm(msg.content);

  const matchesText =
    (content.includes(u) || content.includes(idStr)) &&
    keywords.some((k) => content.includes(k));

  if (matchesText) return true;

  for (const e of msg.embeds || []) {
    const title = norm(e?.title);
    const desc = norm(e?.description);
    const embedText = `${title}\n${desc}`;

    const embedHasUser = embedText.includes(u) || embedText.includes(idStr);
    if (embedHasUser && keywords.some((k) => embedText.includes(k))) return true;

    for (const f of e?.fields || []) {
      const name = norm(f?.name);
      const value = norm(f?.value);
      const fieldText = `${name}\n${value}`;
      const fieldHasUser = fieldText.includes(u) || fieldText.includes(idStr);
      if (fieldHasUser && keywords.some((k) => fieldText.includes(k))) return true;
    }
  }

  return false;
}

async function findLastPromotionAndDemotion(interaction, username, userId) {
  const channel = await interaction.client.channels
    .fetch(PROMOTION_LOG_CHANNEL_ID)
    .catch(() => null);

  if (!channel || !channel.isTextBased?.()) {
    return { lastPromotion: null, lastDemotion: null };
  }

  let scanned = 0;
  let beforeId = undefined;

  let lastPromotion = null;
  let lastDemotion = null;

  while (scanned < MAX_MESSAGES_TO_SCAN && (!lastPromotion || !lastDemotion)) {
    const remaining = MAX_MESSAGES_TO_SCAN - scanned;
    const limit = Math.min(PAGE_SIZE, remaining);

    const messages = await channel.messages
      .fetch({ limit, ...(beforeId ? { before: beforeId } : {}) })
      .catch(() => null);

    if (!messages || messages.size === 0) break;

    for (const msg of messages.values()) {
      scanned++;
      beforeId = msg.id;

      if (!lastPromotion && messageMatchesEvent(msg, username, userId, "promotion")) {
        lastPromotion = msg.createdTimestamp;
      }
      if (!lastDemotion && messageMatchesEvent(msg, username, userId, "demotion")) {
        lastDemotion = msg.createdTimestamp;
      }

      if (scanned >= MAX_MESSAGES_TO_SCAN) break;
      if (lastPromotion && lastDemotion) break;
    }
  }

  return { lastPromotion, lastDemotion };
}

function pickPrimaryDivision(divisions) {
  if (!divisions.length) return null;

  // Highest role.rank wins, tie -> alphabetical by groupName
  const sorted = [...divisions].sort((a, b) => {
    const ar = typeof a.rank === "number" ? a.rank : -1;
    const br = typeof b.rank === "number" ? b.rank : -1;
    if (br !== ar) return br - ar;
    return String(a.groupName || "").localeCompare(String(b.groupName || ""));
  });

  return sorted[0];
}

export default {
  data: new SlashCommandBuilder()
    .setName("accountinfo")
    .setDescription(
      "Public account info lookup (Roblox + RDUSA rank + last promotion/demotion + primary division)."
    )
    .addStringOption((opt) =>
      opt.setName("username").setDescription("Roblox username to look up").setRequired(true)
    ),

  async execute(interaction) {
    const usernameInput = interaction.options.getString("username", true).trim();
    await interaction.deferReply(); // public

    // Roblox user lookup
    const user = await lookupRobloxUser(usernameInput);
    if (!user) {
      return interaction.editReply(`❌ No Roblox user found with the name **${usernameInput}**.`);
    }

    const userId = user.id;
    const username = user.name;
    const displayName = user.displayName || "N/A";

    const profile = await fetchRobloxProfile(userId);
    const createdAt = profile?.created ? new Date(profile.created) : null;
    const createdUnix = createdAt ? Math.floor(createdAt.getTime() / 1000) : null;

    const groupsRoles = await fetchUserGroupsAndRoles(userId);

    // RDUSA rank
    const rdusaEntry = groupsRoles.find((g) => g?.group?.id === RDUSA_GROUP_ID) || null;
    const rdusaRoleName = rdusaEntry?.role?.name || "Not in group";
    const rdusaRank = typeof rdusaEntry?.role?.rank === "number" ? rdusaEntry.role.rank : null;
    const rdusaGroupName = rdusaEntry?.group?.name || "RDUSA | United States Navy";

    const hideDivisions = rdusaEntry?.role?.name ? isJAGOrHigher(rdusaEntry.role.name) : false;

    // last promotion/demotion from log channel
    const { lastPromotion, lastDemotion } = await findLastPromotionAndDemotion(
      interaction,
      username,
      userId
    );
    const lastPromotionUnix = lastPromotion ? Math.floor(lastPromotion / 1000) : null;
    const lastDemotionUnix = lastDemotion ? Math.floor(lastDemotion / 1000) : null;

    // Primary Division
    let primaryDivisionText = "None";

    if (hideDivisions) {
      primaryDivisionText = "Hidden (O9+)";
    } else {
      const allyIds = await fetchAlliedGroupIds(RDUSA_GROUP_ID);

      const divisions = groupsRoles
        .filter((g) => allyIds.includes(g?.group?.id))
        .map((g) => ({
          groupId: g.group.id,
          groupName: g.group.name || `Group ${g.group.id}`,
          roleName: g.role?.name || "Member",
          rank: typeof g.role?.rank === "number" ? g.role.rank : null,
        }));

      const primary = pickPrimaryDivision(divisions);

      if (primary) {
        primaryDivisionText = `**${primary.groupName}** — ${primary.roleName}${
          primary.rank !== null ? ` (Rank ${primary.rank})` : ""
        }`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`Account Info — ${username} (${userId})`)
      .setDescription(`**Username:** ${username}\n**Nickname (Display Name):** ${displayName}`)
      .addFields(
        {
          name: "Account Created",
          value: createdUnix ? `<t:${createdUnix}:F>\n(<t:${createdUnix}:R>)` : "Unknown",
          inline: true,
        },
        {
          name: "RDUSA Rank",
          value: rdusaEntry
            ? `**${rdusaGroupName}**\n${rdusaRoleName}${
                rdusaRank !== null ? ` (Rank ${rdusaRank})` : ""
              }`
            : "Not in group.",
          inline: true,
        },
        {
          name: "Last Promotion",
          value: lastPromotionUnix
            ? `<t:${lastPromotionUnix}:F>\n(<t:${lastPromotionUnix}:R>)`
            : "No log found.",
          inline: true,
        },
        {
          name: "Last Demotion",
          value: lastDemotionUnix
            ? `<t:${lastDemotionUnix}:F>\n(<t:${lastDemotionUnix}:R>)`
            : "No log found.",
          inline: true,
        },
        {
          name: "Primary Division",
          value: primaryDivisionText,
          inline: false,
        }
      )
      .setFooter({ text: "RDUSA Public Account Info Lookup" })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
