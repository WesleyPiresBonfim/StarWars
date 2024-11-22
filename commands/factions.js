const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('faccoes')
        .setDescription('Lista as facções.')
        .addStringOption(option =>
    option.setName('recrutando')
        .setDescription('Exibir apenas facções recrutando.')
        .setRequired(false)
        .addChoices(
        { name: 'Sim', value: 'sim' },
        { name: 'Não', value: 'nao' }
    )),
    async execute(interaction) {
        try {
            // Verificar se o bot está habilitado no servidor
            const serverId = interaction.guild.id;
            const serverQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverStatus = await db.query(serverQuery, [serverId]);

            if (serverStatus.rowCount === 0 || !serverStatus.rows[0].habilitado) {
                return interaction.reply({
                    content: 'O StarWars está desativado neste servidor.',
                    ephemeral: true,
                });
            }

            // Opção para mostrar facções recrutando ou não
            const showRecruitingOnly = interaction.options.getString('recrutando');
            let query = 'SELECT * FROM factions';
            const queryParams = [];

            if (showRecruitingOnly === 'sim') {
                query += ' WHERE tag = $1';
                queryParams.push('#recrutando');
            } else if (showRecruitingOnly === 'nao') {
                query += ' WHERE tag IS NULL OR tag != $1';
                queryParams.push('#recrutando');
            }

            const factionsResult = await db.query(query, queryParams);

            if (factionsResult.rowCount === 0) {
                const noFactionsMessage =
                showRecruitingOnly === 'sim'
                ? 'Nenhuma facção está recrutando no momento.'
                : 'Todas as facções estão recrutando no momento. Nenhuma está completa.';
                return interaction.reply({
                    content: noFactionsMessage,
                    ephemeral: false,
                });
            }

            // Construção da embed
            const embed = new EmbedBuilder()
                .setColor(0x8B0000) // Vermelho escuro para o tema de guerra
                .setTitle('🏴 Facções em Guerra')
                .setDescription('Aqui estão as facções prontas para a batalha:')
                .setThumbnail('https://i.imgur.com/j8rBvkb.jpeg') // Exemplo de ícone de guerra
                .setTimestamp();

            factionsResult.rows.forEach(faction => {
                const membrosLista = faction.membros && faction.membros.length > 0
                ? faction.membros.map(memberId => `<@${memberId}>`).join(', ')
                : 'Nenhum membro.';
                embed.addFields({
                    name: `**${faction.nome}** ${faction.tag ? faction.tag : ''}`,
                    value: `**Líder:** <@${faction.leader_id}>\n**Descrição:** ${faction.descricao || 'Nenhuma descrição fornecida.'}\n**Membros:** ${membrosLista}`,
                    inline: false,
                });
            });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao listar as facções:', error);
            await interaction.reply({
                content: 'Ocorreu um erro ao listar as facções.',
                ephemeral: true,
            });
        }
    },
};
