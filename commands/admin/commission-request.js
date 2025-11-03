import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID } = process.env;

// Roles authorized to approve/deny
const APPROVED_ROLES = [
  "1332198337977389088",
  "1332198334135275620",
  "1332198329899286633",
  "1389056453486051439",
  "1378460548844486776",
  "1332198216560541696",
];

export default {
  data: new SlashCommandBuilder()
    .setName("commission-request")
    .setDescription("Log a Commission Request to Discord and Trello.")
    .addStringOption((o) =>
      o.setName("username").setDescription("Roblox username").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("oldrank").setDescription("Old Rank").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("newrank").setDescription("New Rank").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for promotion").setRequired(true)
    )
    .addUserOption((o) =>
      o.setName("ping").setDescription("Ping your overseer").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.reply({
      content: "🗂️ Logging Commission Request...",
      flags: 64,
    });

    const username = interaction.options.getString("username");
    const oldrank = interaction.options.getString("oldrank");
    const newrank = interaction.options.getString("newrank");
    const reason = interaction.options.getString("reason");
    const pingUser = interaction.options.getUser("ping");

    try {
      // --- Roblox Lookup ---
      const res = await fetch("https://users.roblox.com/v1/usernames/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [username] }),
      });
      const data = await res.json();
      const user = data?.data?.[0];
      if (!user)
        return interaction.editReply({
          content: `❌ Roblox user **${username}** not found.`,
        });

      const userId = user.id;
      const displayName = user.displayName;
      const profile = await fetch(
        `https://users.roblox.com/v1/users/${userId}`
      ).then((r) => r.json());
      const joinDate = new Date(profile.created).toLocaleDateString();

      // --- Embed + Buttons ---
      const embed = new EmbedBuilder()
        .setColor(0x2b88d8)
        .setTitle("📗 Commission Request")
        .setDescription(
          `**Username:** ${username}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}\n**Ping:** <@${pingUser.id}>`
        )
        .addFields(
          { name: "Display Name", value: displayName, inline: true },
          { name: "Join Date", value: joinDate, inline: true },
          { name: "Status", value: "🟡 Pending Review" }
        )
        .setFooter({ text: `Logged by ${interaction.user.tag}` })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("commission_accept")
          .setLabel("Approve")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("commission_deny")
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
      );

      const logChannel = await interaction.client.channels.fetch(
        "1389010246030069820"
      );
      const sentMsg = await logChannel.send({
        content: `<@${pingUser.id}> — new commission request logged.`,
        embeds: [embed],
        components: [buttons],
      });

      // --- Trello Setup ---
      const lists = await fetch(
        `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then((r) => r.json());

      const firstChar = username[0].toUpperCase();
      const ranges = {
        "0-9": /^[0-9]/,
        "A-C": /^[A-C]/,
        "D-F": /^[D-F]/,
        "G-I": /^[G-I]/,
        "J-L": /^[J-L]/,
        "M-O": /^[M-O]/,
        "P-R": /^[P-R]/,
        "S-U": /^[S-U]/,
        "V-Z": /^[V-Z]/,
      };
      let listName = "0-9";
      for (const [range, regex] of Object.entries(ranges))
        if (regex.test(firstChar)) listName = range;

      const list = lists.find((l) => l.name === listName);
      if (!list)
        return interaction.editReply({
          content: `❌ Could not find Trello list for ${listName}.`,
        });

      const cards = await fetch(
        `https://api.trello.com/1/lists/${list.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then((r) => r.json());

      const cardName = `${username} (${userId})`;
      let card = cards.find(
        (c) => c.name.toLowerCase() === cardName.toLowerCase()
      );

      const desc = `**Roblox Username:** ${username}\n**Display Name:** ${displayName}\n**Roblox ID:** ${userId}\n**Join Date:** ${joinDate}`;

      // --- Create card if not found ---
      if (!card) {
        const res = await fetch(
          `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idList: list.id, name: cardName, desc }),
          }
        );
        card = await res.json();
      }

      // --- Trello Comment (log entry) ---
      const comment = `🟡 Commission Request Logged\nBy: ${interaction.user.tag}\nDate: ${new Date().toUTCString()}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}`;
      await fetch(
        `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `${comment}\n\n[View Discord Log](https://discord.com/channels/${interaction.guild.id}/${logChannel.id}/${sentMsg.id})`,
          }),
        }
      );

      await interaction.editReply({
        content: `✅ Commission Request for **${username}** logged successfully and sent to <@${pingUser.id}>.`,
      });

      // 🧠 Collector for Buttons
      const collector = sentMsg.createMessageComponentCollector({
        time: 60 * 60 * 1000,
      });

      collector.on("collect", async (i) => {
        const member = await i.guild.members.fetch(i.user.id).catch(() => null);
        const isAuthorized =
          i.user.id === pingUser.id ||
          member?.roles.cache.some((r) => APPROVED_ROLES.includes(r.id));

        if (!isAuthorized) {
          if (!i.replied && !i.deferred)
            return i.reply({
              content: "🚫 You are not authorized to manage this request.",
              flags: 64,
            });
          return;
        }

        // ✅ Approve
        if (i.customId === "commission_accept") {
          await i.deferUpdate();

          const approvedEmbed = EmbedBuilder.from(embed)
            .setColor(0x57f287)
            .spliceFields(2, 1, {
              name: "Status",
              value: `✅ Approved by ${i.user.tag}`,
            });

          await sentMsg
            .edit({ embeds: [approvedEmbed], components: [] })
            .catch(() => null);

          const trelloComment = `✅ Commission Approved\nBy: ${i.user.tag}\nDate: ${new Date().toUTCString()}`;
          await fetch(
            `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: trelloComment }),
            }
          ).catch(() => null);

          await i.channel.send({
            content: `✅ Commission request approved by ${i.user}.`,
          });
        }

        // ❌ Deny
        if (i.customId === "commission_deny") {
          const modal = new ModalBuilder()
            .setCustomId("commission_deny_modal")
            .setTitle("Deny Commission Request");

          const reasonInput = new TextInputBuilder()
            .setCustomId("deny_reason")
            .setLabel("Reason for Denial")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(reasonInput)
          );
          await i.showModal(modal);

          const modalSubmit = await i
            .awaitModalSubmit({
              time: 5 * 60 * 1000,
              filter: (m) =>
                m.customId === "commission_deny_modal" &&
                m.user.id === i.user.id,
            })
            .catch(() => null);

          if (!modalSubmit) return;

          await modalSubmit.deferReply({ ephemeral: true });
          const denyReason =
            modalSubmit.fields.getTextInputValue("deny_reason");

          const deniedEmbed = EmbedBuilder.from(embed)
            .setColor(0xed4245)
            .spliceFields(2, 1, {
              name: "Status",
              value: `❌ Denied by ${i.user.tag}\n**Reason:** ${denyReason}`,
            });

          await sentMsg
            .edit({ embeds: [deniedEmbed], components: [] })
            .catch(() => null);

          const trelloComment = `❌ Commission Denied\nBy: ${i.user.tag}\nReason: ${denyReason}\nDate: ${new Date().toUTCString()}`;
          await fetch(
            `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: trelloComment }),
            }
          ).catch(() => null);

          await modalSubmit.editReply({
            content: `❌ Commission request denied by ${i.user}.`,
          });
        }
      });

      collector.on("end", async () => {
        const expiredEmbed = EmbedBuilder.from(embed).spliceFields(2, 1, {
          name: "Status",
          value: "⚫ Review period expired",
        });
        await sentMsg
          .edit({ embeds: [expiredEmbed], components: [] })
          .catch(() => null);
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({
        content: "❌ Error logging Commission Request.",
      });
    }
  },
};
