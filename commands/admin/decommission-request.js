import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { trelloFetch } from "../../utils/trelloFetch.js";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID } = process.env;

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
    .setName("decommission-request")
    .setDescription("Log a Decommission Request to Discord and Trello.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addStringOption(o => o.setName("oldrank").setDescription("Old Rank").setRequired(true))
    .addStringOption(o => o.setName("newrank").setDescription("New Rank").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for demotion").setRequired(true))
    .addStringOption(o =>
      o
        .setName("ping")
        .setDescription("User or role to ping (mention them directly or use @role)")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.reply({ content: "🗂️ Logging Decommission Request...", flags: MessageFlags.Ephemeral });

    const username = interaction.options.getString("username");
    const oldrank = interaction.options.getString("oldrank");
    const newrank = interaction.options.getString("newrank");
    const reason = interaction.options.getString("reason");
    const ping = interaction.options.getString("ping");

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
        return interaction.editReply({ content: `❌ Roblox user **${username}** not found.` });

      const userId = user.id;
      const displayName = user.displayName;
      const profile = await fetch(`https://users.roblox.com/v1/users/${userId}`).then(r => r.json());
      const joinDate = new Date(profile.created).toLocaleDateString();

      // --- Embed with Status ---
      const embed = new EmbedBuilder()
        .setColor(0xfef48b)
        .setTitle("📙 Decommission Request")
        .setDescription(
          `**Username:** ${username}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}`
        )
        .addFields(
          { name: "Display Name", value: displayName, inline: true },
          { name: "Join Date", value: joinDate, inline: true },
          { name: "Status", value: "🟡 **Pending Approval**" }
        )
        .setFooter({ text: `Logged by ${interaction.user.tag}` })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("approve_dec")
          .setLabel("Approve")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("deny_dec")
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
      );

      const logChannel = await interaction.client.channels.fetch("1389010266003476521");

      // Send message with ping
      const sentMsg = await logChannel.send({
        content: `${ping}`,
        embeds: [embed],
        components: [buttons],
      });

      // --- Trello Setup ---
      const lists = await fetch(
        `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then(r => r.json());

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

      const list = lists.find(l => l.name === listName);
      const cards = await fetch(
        `https://api.trello.com/1/lists/${list.id}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      ).then(r => r.json());

      const cardName = `${username} (${userId})`;
      let card = cards.find(c => c.name.toLowerCase() === cardName.toLowerCase());
      const desc = `**Roblox Username:** ${username}\n**Display Name:** ${displayName}\n**Roblox ID:** ${userId}\n**Join Date:** ${joinDate}`;

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

      const comment = `📙 Decommission Request Logged\nBy: ${interaction.user.tag}\nDate: ${new Date().toUTCString()}\n**Old Rank:** ${oldrank}\n**New Rank:** ${newrank}\n**Reason:** ${reason}`;
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
        content: `✅ Decommission Request for **${username}** logged successfully.`,
      });

      // --- Button Collector ---
      const collector = sentMsg.createMessageComponentCollector();

      collector.on("collect", async (btnInt) => {
        const memberRoles = btnInt.member.roles.cache.map(r => r.id);
        const canUse = memberRoles.some(r => APPROVED_ROLES.includes(r));

        if (!canUse) {
          return btnInt.reply({
            content: "❌ You are not authorized to approve or deny requests.",
            flags: MessageFlags.Ephemeral,
          });
        }

        if (btnInt.customId === "approve_dec") {
          const updatedEmbed = EmbedBuilder.from(embed)
            .setColor(0x57f287)
            .spliceFields(2, 1, {
              name: "Status",
              value: `🟢 **Approved**\nReviewed by: ${btnInt.user.tag}`,
            })
            .setFooter({ text: `Approved by ${btnInt.user.tag}` })
            .setTimestamp();

          await sentMsg.edit({ embeds: [updatedEmbed], components: [] });
          await btnInt.reply({ content: "✅ Request approved.", flags: MessageFlags.Ephemeral });

          await fetch(
            `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `✅ Approved by ${btnInt.user.tag} on ${new Date().toUTCString()}`,
              }),
            }
          );
        }

        if (btnInt.customId === "deny_dec") {
          const modal = new ModalBuilder()
            .setCustomId("deny_reason_modal")
            .setTitle("Deny Request - Reason Required");

          const reasonInput = new TextInputBuilder()
            .setCustomId("deny_reason")
            .setLabel("Please provide a reason for denial")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Enter the reason here...")
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          await btnInt.showModal(modal);

          const modalSubmission = await btnInt.awaitModalSubmit({
            time: 120000,
            filter: (i) => i.customId === "deny_reason_modal" && i.user.id === btnInt.user.id,
          }).catch(() => null);

          if (!modalSubmission) return;

          const denialReason = modalSubmission.fields.getTextInputValue("deny_reason");

          const updatedEmbed = EmbedBuilder.from(embed)
            .setColor(0xed4245)
            .spliceFields(2, 1, {
              name: "Status",
              value: `🔴 **Denied**\nReason: ${denialReason}\nReviewed by: ${btnInt.user.tag}`,
            })
            .setFooter({ text: `Denied by ${btnInt.user.tag}` })
            .setTimestamp();

          await sentMsg.edit({ embeds: [updatedEmbed], components: [] });

          await modalSubmission.reply({
            content: "❌ Request denied and reason logged.",
            flags: MessageFlags.Ephemeral,
          });

          await fetch(
            `https://api.trello.com/1/cards/${card.id}/actions/comments?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `❌ Denied by ${btnInt.user.tag} on ${new Date().toUTCString()}\n**Reason:** ${denialReason}`,
              }),
            }
          );
        }
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: "❌ Error logging Decommission Request." });
    }
  },
};
