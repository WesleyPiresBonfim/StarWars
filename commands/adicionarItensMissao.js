const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adicionar-itens-missao')
        .setDescription('Adiciona itens a uma missão existente.'),
        //.setDefaultMemberPermissions(0),
    async execute(interaction) {
        const missionsQuery = 'SELECT id, nome FROM missoes';
        const missionsResult = await db.query(missionsQuery);

        if (missionsResult.rowCount === 0) {
            return interaction.reply({
                content: '❌ Não há missões disponíveis para adicionar itens.',
                ephemeral: false,
            });
        }

        const missions = missionsResult.rows;
        const missionOptions = missions.map(m => ({
            label: m.nome,
            value: `${m.id}`,
        }));

        const selectMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_mission_add_items')
                .setPlaceholder('Selecione uma missão')
                .addOptions(missionOptions)
        );

        await interaction.reply({
            content: 'Selecione a missão para adicionar itens:',
            components: [selectMenu],
            ephemeral: false,
        });

        const collector = interaction.channel.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && i.customId === 'select_mission_add_items',
            time: 300000,
        });

        collector.on('collect', async (i) => {
            const missionId = parseInt(i.values[0], 10);

            const itemsQuery = 'SELECT id, nome FROM itens';
            const itemsResult = await db.query(itemsQuery);
            const items = itemsResult.rows;

            const itemOptions = items.map(item => ({
                label: item.nome,
                value: `${item.id}`,
            }));

            const itemSelectMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`add_items_to_mission_${missionId}`)
                    .setPlaceholder('Selecione os itens')
                    .addOptions(itemOptions)
                    .setMinValues(1)
                    .setMaxValues(itemOptions.length)
            );

            await i.reply({
                content: 'Selecione os itens que deseja adicionar:',
                components: [itemSelectMenu],
                ephemeral: false,
            });

            const itemCollector = i.channel.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id && i.customId.startsWith('add_items_to_mission_'),
                time: 300000,
            });

            itemCollector.on('collect', async (itemInteraction) => {
                const selectedItems = itemInteraction.values;

                const modal = new ModalBuilder()
                    .setCustomId(`add_item_quantities_${missionId}`)
                    .setTitle('Quantidades para os itens');

                selectedItems.forEach((itemId, index) => {
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId(`quantity_item_${itemId}`)
                                .setLabel(`Quantidade para Item ${index + 1}`)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        )
                    );
                });

                await itemInteraction.showModal(modal);

                const submitted = await itemInteraction.awaitModalSubmit({ time: 300000 }).catch(() => null);

                if (!submitted) {
                    return itemInteraction.reply({ content: 'Tempo esgotado para definir quantidades.', ephemeral: false });
                }

                for (const itemId of selectedItems) {
                    const quantity = parseInt(submitted.fields.getTextInputValue(`quantity_item_${itemId}`), 10);

                    // Adicionar na tabela correta: missoes_itens
                    await db.query('INSERT INTO missoes_itens (missao_id, item_id, quantidade) VALUES ($1, $2, $3)', [
                        missionId,
                        parseInt(itemId, 10),
                        quantity,
                    ]);
                }

                await submitted.reply({ content: 'Itens adicionados com sucesso à missão!', ephemeral: false });
            });
        });
    },
};
