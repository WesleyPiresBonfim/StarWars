const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database.js');

const CONSTELACOES_ICONS = {
    Silver: '🌑',
    Gold: '🌕',
    Diamond: '💎',
    Dream: '🌠',
    Star: '⭐',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('constelacoes')
        .setDescription('Exibe as constelações disponíveis para abrir.'),
    async execute(interaction) {
        try {
            const userId = interaction.user.id;

            console.log(`[LOG] Comando /constelacoes executado por ${userId}`);

            // Recuperar informações das caixas do usuário
            const caixasQuery = 'SELECT silver, gold, diamond, dream, star FROM caixas WHERE user_id = $1';
            const caixasResult = await db.query(caixasQuery, [userId]);

            if (caixasResult.rowCount === 0) {
                return interaction.reply({
                    content: '❌ Você não possui constelações. Use outras funcionalidades para ganhar caixas!',
                    ephemeral: true,
                });
            }

            const caixas = caixasResult.rows[0];

            // Criar a lista de constelações disponíveis
            const constelacoesDisponiveis = Object.entries(caixas)
                .filter(([, quantidade]) => quantidade > 0)
                .map(([tipo, quantidade]) => ({
                name: `${CONSTELACOES_ICONS[tipo.charAt(0).toUpperCase() + tipo.slice(1)]} Constelação ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`,
                value: `Quantidade: **${quantidade}**`,
                inline: true,
            }));

            if (constelacoesDisponiveis.length === 0) {
                return interaction.reply({
                    content: 'Você não possui constelações disponíveis para abrir.',
                    ephemeral: true,
                });
            }

            // Criar a embed com as constelações disponíveis
            const embed = new EmbedBuilder()
                .setColor(0x1e90ff)
                .setTitle('🌌 Constelações Disponíveis')
                .setDescription('Veja abaixo suas constelações disponíveis para abrir:')
                .addFields(constelacoesDisponiveis)
                .setFooter({ text: 'Use o comando /abrirconstelacao para abrir!' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            console.log(`[LOG] Constelações enviadas para ${userId}`);
        } catch (error) {
            console.error('Erro ao executar o comando /constelacoes:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao tentar exibir suas constelações disponíveis.',
                ephemeral: true,
            });
        }
    },
};
