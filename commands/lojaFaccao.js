const { SlashCommandBuilder, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loja-faccao')
        .setDescription('Exibe a loja de itens de guerra e permite a compra para a facção.'),
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
                SELECT id, nome, saldo, itens_comprados
                FROM factions
                WHERE leader_id = $1
            `;
            const factionResult = await db.query(factionQuery, [userId]);

            if (factionResult.rowCount === 0) {
                return interaction.reply({
                    content: 'Apenas o líder da facção pode realizar compras na loja.',
                    ephemeral: true,
                });
            }

            const faction = factionResult.rows[0];
            const shopQuery = 'SELECT id, nome, descricao, preco FROM loja_faccao';
            const shopResult = await db.query(shopQuery);

            if (shopResult.rowCount === 0) {
                return interaction.reply({
                    content: 'A loja de facção está vazia.',
                    ephemeral: true,
                });
            }

            const lojaItens = shopResult.rows;

            const lojaEmbed = new EmbedBuilder()
                .setColor(0x8B0000)
                .setTitle('⚔️ Loja da Facção ⚔️')
                .setDescription('Aqui você encontra os itens mais poderosos para dominar a guerra:')
                .setThumbnail('https://i.imgur.com/qEQi6X4.png')
                .addFields(lojaItens.map((item, index) => ({
                name: `Item ${index + 1}: ${item.nome} - ${item.preco} StarCoins`,
                value: item.descricao,
            })));

            const itemOptions = lojaItens.map(item => ({
                label: item.nome,
                value: item.id.toString(),
            }));

            const menu = new StringSelectMenuBuilder()
                .setCustomId('selectItem')
                .setPlaceholder('Selecione um item para comprar')
                .addOptions(itemOptions);

            const row = new ActionRowBuilder().addComponents(menu);

            await interaction.reply({
                embeds: [lojaEmbed],
                components: [row],
                ephemeral: true,
            });

            const filter = i => i.customId === 'selectItem' && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                try {
                    const selectedItemId = parseInt(i.values[0]);
                    const selectedItem = lojaItens.find(item => item.id === selectedItemId);

                    if (!selectedItem) {
                        return i.reply({
                            content: 'Item selecionado não encontrado.',
                            ephemeral: true,
                        });
                    }

                    const confirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`comprar-${selectedItemId}`)
                            .setLabel('Comprar')
                            .setStyle(ButtonStyle.Success)
                    );

                    await i.update({
                        content: `Você selecionou o item: **${selectedItem.nome}**. Confirme a compra.`,
                        components: [confirmRow],
                        ephemeral: true,
                    });

                    const buttonFilter = i => i.customId === `comprar-${selectedItemId}` && i.user.id === interaction.user.id;
                    const buttonCollector = interaction.channel.createMessageComponentCollector({ filter: buttonFilter, time: 60000 });

                    buttonCollector.on('collect', async i => {
                        try {
                            const itensComprados = faction.itens_comprados ? JSON.parse(faction.itens_comprados) : [];

                            if (faction.saldo < selectedItem.preco) {
                                return i.reply({
                                    content: 'Saldo insuficiente para comprar este item.',
                                    ephemeral: true,
                                });
                            }

                            if (itensComprados.includes(selectedItemId)) {
                                return i.reply({
                                    content: `Sua facção já possui o item **${selectedItem.nome}**.`,
                                    ephemeral: true,
                                });
                            }

                            itensComprados.push(selectedItemId);

                            const updateFactionQuery = `
                                UPDATE factions
                                SET saldo = saldo - $1,
                                    itens_comprados = $2
                                WHERE id = $3
                            `;
                            await db.query(updateFactionQuery, [selectedItem.preco, JSON.stringify(itensComprados), faction.id]);

                            await i.update({
                                content: `Item **${selectedItem.nome}** comprado com sucesso e adicionado ao arsenal da facção.`,
                                components: [],
                                embeds: [],
                            });
                        } catch (error) {
                            console.error('Erro ao processar a compra:', error);
                            await i.reply({
                                content: 'Ocorreu um erro ao tentar processar a compra.',
                                ephemeral: true,
                            });
                        }
                    });
                } catch (error) {
                    console.error('Erro ao processar a seleção de item:', error);
                    await i.reply({
                        content: 'Ocorreu um erro ao processar sua seleção.',
                        ephemeral: true,
                    });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ content: 'Tempo esgotado. Nenhuma ação foi realizada.', components: [] });
                }
            });
        } catch (error) {
            console.error('Erro ao exibir a loja da facção:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao tentar acessar a loja da facção.',
                ephemeral: true,
            });
        }
    },
};
