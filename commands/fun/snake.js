import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("snake")
    .setDescription("Play a game of Snake inside Discord!"),

  async execute(interaction) {
    await interaction.deferReply();

    // ───────────────────────────────
    // 🐍 Game Settings
    // ───────────────────────────────
    const boardSize = 8;
    let snake = [{ x: 3, y: 3 }];
    let direction = { x: 1, y: 0 }; // Moving right at start

    // Random apple spawn
    let apple = {
      x: Math.floor(Math.random() * boardSize),
      y: Math.floor(Math.random() * boardSize),
    };

    let alive = true;
    let score = 0;

    // ───────────────────────────────
    // 📦 Emoji Key
    // ───────────────────────────────
    const EMOJI_SNAKE = "🟩";
    const EMOJI_APPLE = "🍎";
    const EMOJI_EMPTY = "⬛";

    // ───────────────────────────────
    // 🧱 Build Board
    // ───────────────────────────────
    function renderBoard() {
      let board = "";

      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          if (x === apple.x && y === apple.y) {
            board += EMOJI_APPLE;
          } else if (snake.some(s => s.x === x && s.y === y)) {
            board += EMOJI_SNAKE;
          } else {
            board += EMOJI_EMPTY;
          }
        }
        board += "\n";
      }
      return board;
    }

    // ───────────────────────────────
    // 🎮 Controls
    // ───────────────────────────────
    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("up").setLabel("⬆️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("down").setLabel("⬇️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("left").setLabel("⬅️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("right").setLabel("➡️").setStyle(ButtonStyle.Primary),
    );

    // ───────────────────────────────
    // 🧩 Update Game State
    // ───────────────────────────────
    async function update() {
      if (!alive) return;

      const head = snake[0];
      const newHead = { x: head.x + direction.x, y: head.y + direction.y };

      // Check wall collision
      if (newHead.x < 0 || newHead.x >= boardSize || newHead.y < 0 || newHead.y >= boardSize) {
        alive = false;
      }

      // Check self collision
      if (snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
        alive = false;
      }

      if (!alive) {
        const gameOver = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("💀 Game Over!")
          .setDescription(`**Final Score:** ${score}`);

        return interaction.editReply({ embeds: [gameOver], components: [] });
      }

      // Move snake
      snake.unshift(newHead);

      // Apple eaten
      if (newHead.x === apple.x && newHead.y === apple.y) {
        score++;
        apple = {
          x: Math.floor(Math.random() * boardSize),
          y: Math.floor(Math.random() * boardSize),
        };
      } else {
        snake.pop();
      }

      // Update board
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🐍 Snake Game")
        .setDescription(renderBoard())
        .addFields({ name: "Score", value: String(score) })
        .setFooter({ text: "Use the buttons to move!" });

      await interaction.editReply({ embeds: [embed], components: [controls] });
    }

    // Initial board render
    await update();

    // ───────────────────────────────
    // 🎯 Button Interaction Collector
    // ───────────────────────────────
    const collector = interaction.channel.createMessageComponentCollector({
      time: 120000, // 2 minutes
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({ content: "This isn’t your Snake game!", ephemeral: true });
      }

      await btn.deferUpdate();

      switch (btn.customId) {
        case "up":
          direction = { x: 0, y: -1 };
          break;
        case "down":
          direction = { x: 0, y: 1 };
          break;
        case "left":
          direction = { x: -1, y: 0 };
          break;
        case "right":
          direction = { x: 1, y: 0 };
          break;
      }

      await update();
    });

    collector.on("end", () => {
      if (alive) {
        interaction.editReply({
          content: "⏰ Game expired!",
          components: [],
        });
      }
    });
  },
};
