const { Client, GatewayIntentBits, Collection, REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("./config.json");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
const commands = [];

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(config.bot_token);

(async () => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(config.client_id, config.guild_id),
            { body: commands }
        );
    } catch (err) {
        console.error(err);
    }
})();

const cooldowns = new Map();

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        if (interaction.member.roles.cache.has(config.blacklist_role)) {
            if (!interaction.replied) await interaction.reply({ content: "User is blacklisted.", flags: 64 });
            return;
        }

        if (command.adminOnly && !config.admin_whitelist.includes(interaction.user.id)) {
            if (!interaction.replied) await interaction.reply({ content: "You don’t have permission to use this command.", flags: 64 });
            return;
        }

        if (interaction.commandName === "generate") {
            const type = interaction.options.getString("type");
            const userId = interaction.user.id;

            if ((type === "Free" && interaction.member.roles.cache.has(config.cooldown_bypass_free_role)) ||
                (type === "Premium" && interaction.member.roles.cache.has(config.cooldown_bypass_premium_role))) {
                await command.execute(interaction);
                return;
            }

            const cooldownAmount = type === "Premium"
                ? config.cooldown_premium * 1000
                : config.cooldown_free * 1000;

            const key = `${userId}-${type}`;
            const now = Date.now();
            if (!cooldowns.has(key)) cooldowns.set(key, 0);

            if (now < cooldowns.get(key) + cooldownAmount) {
                const timeLeft = Math.ceil((cooldowns.get(key) + cooldownAmount - now) / 1000);
                if (!interaction.replied) await interaction.reply({ content: `On cooldown, wait **${timeLeft}s** before using this again.`, flags: 64 });
                return;
            }

            await command.execute(interaction);
            cooldowns.set(key, now);
            return;
        }

        await command.execute(interaction);
    } catch (err) {
        console.error(err);
        if (!interaction.replied) await interaction.reply({ content: "Error executing this command.", flags: 64 });
    }
});

client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.login(config.bot_token);
