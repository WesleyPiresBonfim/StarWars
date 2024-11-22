const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventario-faccao')
        .setDescription('Exibe o arsenal da facção para o líder.'),
    async execute(interaction) {
        try {
            const serverId = interaction.guild.id;
            const serverQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverStatus = await db.query(serverQuery, [serverId]);

            if (serverStatus.rowCount === 0 || !serverStatus.rows[0].habilitado) {
                return interaction.reply({
                    content: 'O StarWars está desativado neste servidor.',
                    ephemeral: true,
                });
            }

            const userId = interaction.user.id;
            const factionQuery = `
                SELECT id, nome, emblema, itens_comprados
                FROM factions
                WHERE leader_id = $1
            `;
            const factionResult = await db.query(factionQuery, [userId]);

            if (factionResult.rowCount === 0) {
                return interaction.reply({
                    content: 'Apenas o líder da facção pode ver o arsenal.',
                    ephemeral: true,
                });
            }

            const faction = factionResult.rows[0];
            const itensComprados = faction.itens_comprados ? JSON.parse(faction.itens_comprados) : [];

            if (itensComprados.length === 0) {
                return interaction.reply({
                    content: 'O arsenal da facção está vazio!',
                    ephemeral: true,
                });
            }

            const shopQuery = `
                SELECT id, nome, descricao
                FROM loja_faccao
                WHERE id = ANY($1)
            `;
            const shopResult = await db.query(shopQuery, [itensComprados]);

            if (shopResult.rowCount === 0) {
                return interaction.reply({
                    content: 'O arsenal da facção está vazio!',
                    ephemeral: true,
                });
            }

            const itemDetails = shopResult.rows;

            const inventoryEmbed = new EmbedBuilder()
                .setColor(0x2F4F4F)
                .setTitle(`🩸 Arsenal da Facção: ${faction.nome}`)
                .setDescription('Equipamentos de guerra e suprimentos mortais:')
                .setThumbnail(faction.emblema || 'https://i.imgur.com/qEQi6X4.png')
                .addFields(itemDetails.map((item, index) => ({
                name: `${index + 1} - ${item.nome}`,
                value: item.descricao,
                inline: true,
            })))
                .setFooter({
                text: 'Pronto para o massacre!',
                iconURL: 'https://i.imgur.com/qEQi6X4.png',
            })
                .setTimestamp();

            await interaction.reply({
                embeds: [inventoryEmbed],
                ephemeral: true,
            });
        } catch (error) {
            console.error('Erro ao exibir o inventário da facção:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao tentar acessar o arsenal da facção.',
                ephemeral: true,
            });
        }
    },
};
