const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Exibe o perfil de um usuário')
        .addUserOption(option =>
    option.setName('usuario')
        .setDescription('O usuário cujo perfil você deseja ver')
        .setRequired(false)),
    async execute(interaction) {
        try {
            // Verificar se o bot está habilitado no servidor
            const serverId = interaction.guild.id;
            const checkServerQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverStatus = await db.query(checkServerQuery, [serverId]);

            if (serverStatus.rowCount === 0 || !serverStatus.rows[0].habilitado) {
                return interaction.reply({
                    content: 'O bot StarWars está desativado neste servidor.',
                    ephemeral: true,
                });
            }

            // Determinar o usuário alvo
            const targetUser = interaction.options.getUser('usuario') || interaction.user;
            const userId = targetUser.id;

            // Buscar perfil no banco de dados
            const checkUserQuery = 'SELECT saldo, escolha_inicial, estatisticas_guerra FROM users WHERE user_id = $1';
            const userResult = await db.query(checkUserQuery, [userId]);

            if (userResult.rowCount === 0) {
                return interaction.reply({
                    content: `Perfil de ${targetUser.username} não encontrado! Use o comando /registrar para criar um perfil.`,
                    ephemeral: true,
                });
            }

            // Obter dados do perfil
            const { saldo, escolha_inicial, estatisticas_guerra } = userResult.rows[0];

            // Obter a URL da imagem do perfil do Discord do usuário
            const avatarURL = targetUser.displayAvatarURL({ format: 'png', dynamic: true, size: 512 });

            // Criar a embed de exibição do perfil
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(`Perfil de ${targetUser.username}`)
                .setDescription('Aqui estão os detalhes do perfil.')
                .setThumbnail(avatarURL) // Adiciona a imagem do perfil do Discord
                .addFields(
                { name: '💰 Saldo', value: `${saldo} StarCoins`, inline: false },
                //{ name: '🎉 Escolha Inicial', value: escolha_inicial.replace('_', ' '), inline: false },
                //{ name: '\u200B', value: '\u200B', inline: false }, // Campo vazio para alinhamento
                { name: '⚔️ Batalhas Vencidas', value: `${estatisticas_guerra.batalhas_vencidas}`, inline: false },
                { name: '💥 Batalhas Perdidas', value: `${estatisticas_guerra.batalhas_perdidas}`, inline: false }
            )
                .setFooter({ text: 'Use os comandos disponíveis para progredir.' });

            // Enviar a embed de perfil
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao exibir o perfil:', error);
            await interaction.reply({
                content: 'Ocorreu um erro ao tentar exibir o perfil.',
                ephemeral: true,
            });
        }
    },
};
