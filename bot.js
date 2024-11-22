const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const { REST } = require('@discordjs/rest');
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const path = require('path');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

client.commands = new Collection();
const cooldowns = new Map(); // Mapa global para cooldown

const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

pool.connect()
    .then(() => console.log('Conexão com o banco de dados estabelecida.'))
    .catch(err => console.error('Erro ao conectar ao banco de dados:', err));

// Carregar comandos dinamicamente
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.data.name, command);
}

// Registro de eventos
client.once('ready', () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});

const queue = [];

const processQueue = async () => {
    if (queue.length === 0) return;

    const { interaction, resolve } = queue.shift();

   // try {
   //     // Garantir que a interação será respondida corretamente
   //     if (!interaction.replied && !interaction.deferred) {
   //         await resolve(interaction);
   //     }
   // } catch (error) {
   //     console.error("Erro durante o processamento da interação:", error);
   // }

    // Processar a próxima interação na fila
    processQueue();
};

// Middleware Global: Verificação de habilitação do servidor
async function isBotEnabledInServer(serverId) {
    try {
        const query = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
        const result = await pool.query(query, [serverId]);
        return result.rowCount > 0 && result.rows[0].habilitado;
    } catch (error) {
        console.error('Erro ao verificar o status do bot no servidor:', error);
        return false;
    }
}

const bypassCommands = ['habilitar']; // Lista de comandos que ignoram a verificação de habilitação

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;


    //queue.push({
    //    interaction,
    //    resolve: async (i) => {
    //        try {
    //            await command.execute(i);
    //        } catch (error) {
    //            console.error(`Erro ao executar o comando ${interaction.commandName}:`, error);
    //            if (!i.replied && !i.deferred) {
    //                await i.reply({
    //                    content: '❌ Ocorreu um erro ao executar este comando. Tente novamente mais tarde.',
    //                    ephemeral: true,
    //                });
    //            }
    //        }
    //    }
    //});

    // Processa a fila
    processQueue();

    const userId = interaction.user.id;
    const serverId = interaction.guild.id;
    const cooldownTime = 7000; // Cooldown global (7 segundos)

    try {
        // Verificar se o comando está na lista de bypass
        if (!bypassCommands.includes(interaction.commandName)) {
            // Verificar se o bot está habilitado no servidor
            const botEnabled = await isBotEnabledInServer(serverId);
            if (!botEnabled) {
                return interaction.reply({
                    content: '❌ O StarWars está desativado neste servidor.',
                    ephemeral: true,
                });
            }
        }

        // Implementar cooldown global
        if (cooldowns.has(userId)) {
            const lastUsed = cooldowns.get(userId);
            const now = Date.now();

            if (now - lastUsed < cooldownTime) {
                const timeLeft = ((cooldownTime - (now - lastUsed)) / 1000).toFixed(1);
                return;
            };
        }

        // Evitar respostas de erro para interações já respondidas ou adiadas
        if (interaction.replied || interaction.deferred) {
            // Ignorar interações já respondidas ou retardadas
            return;
        }

        // Executa o comando
        cooldowns.set(userId, Date.now());
        await command.execute(interaction);

        process.on('newListener', (event, listener) => {
            if (event === 'uncaughtException') {
                console.log('Novo listener adicionado para uncaughtException');
            }
        });


        process.removeAllListeners('uncaughtException');
        process.on('uncaughtException', (err) => {
            console.error('Exceção não tratada:', err);
            process.exit(1);
        });

        process.on('unhandledRejection', (err) => {
            console.error('Rejeição não tratada:', err);
        });


    } catch (error) {
        console.error(`Erro ao executar o comando ${interaction.commandName}:`, error);

        if (interaction.replied || interaction.deferred) {
            // Evita a resposta de erro visível para o usuário
            console.error("Erro ocorrido, mas não será exibido para o usuário.");
        } else {
            // Evita a resposta de erro visível para o usuário
            console.error("Erro ocorrido, mas não será exibido para o usuário.");
        }
    }
});

// Login do bot
client.login(process.env.TOKEN);
