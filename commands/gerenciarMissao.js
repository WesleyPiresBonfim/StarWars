const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gerenciar-missao')
        .setDescription('Gerencie as missões existentes.'),
        //.setDefaultMemberPermissions(0),
    async execute(interaction) {
        const allowedRoles = ['1152754038341906482', '1306228862576758864'];
        const memberRoles = interaction.member.roles.cache.map(role => role.id);
        if (!allowedRoles.some(role => memberRoles.includes(role))) {
            return interaction.reply({
                content: 'Você não tem permissão para usar este comando.',
                ephemeral: false,
            });
        }

        const mainMenuEmbed = new EmbedBuilder()
            .setTitle('Gerenciar Missões')
            .setDescription('Escolha uma ação para gerenciar missões:')
            .addFields([
            { name: '➕ Adicionar Missão', value: 'Crie uma nova missão.' },
            { name: '❌ Excluir Missão', value: 'Remova uma missão.' },
        ])
            .setColor('#00AAFF');

        const mainMenuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('manage_mission')
                .setPlaceholder('Selecione uma ação')
                .addOptions([
                { label: 'Adicionar Missão', value: 'add', description: 'Crie uma nova missão.' },
                { label: 'Excluir Missão', value: 'delete', description: 'Remova uma missão.' },
            ])
        );

        await interaction.reply({ embeds: [mainMenuEmbed], components: [mainMenuRow], ephemeral: false });

        const collector = interaction.channel.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && i.customId === 'manage_mission',
            time: 300000,
        });

        collector.on('collect', async (i) => {
            const action = i.values[0];

            if (action === 'add') {
                await handleAddMission(interaction, i);
            } else if (action === 'delete') {
                await handleDeleteMission(interaction, i);
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'time') {
                interaction.followUp({ content: 'O tempo para gerenciar missões expirou.', ephemeral: false });
            }
        });
    },
};

async function handleAddMission(interaction, menuInteraction) {
    try {
        console.log('[LOG] Iniciando processo para adicionar nova missão.');

        const modal = new ModalBuilder()
            .setCustomId('add_mission_modal')
            .setTitle('Adicionar Nova Missão');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('mission_name')
                    .setLabel('Nome da Missão')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('mission_description')
                    .setLabel('Descrição da Missão')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('mission_duration')
                    .setLabel('Duração (em minutos)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('mission_starcoins')
                    .setLabel('Recompensa em StarCoins')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

        console.log('[LOG] Exibindo modal para adicionar missão.');
        await menuInteraction.showModal(modal);

        const submitted = await menuInteraction.awaitModalSubmit({ time: 300000 }).catch(() => null);

        if (!submitted) {
            return menuInteraction.followUp({ content: 'Tempo esgotado.', ephemeral: false });
        }

        const missionName = submitted.fields.getTextInputValue('mission_name');
        const missionDescription = submitted.fields.getTextInputValue('mission_description');
        const missionDuration = parseInt(submitted.fields.getTextInputValue('mission_duration'), 10);
        const missionStarcoins = parseInt(submitted.fields.getTextInputValue('mission_starcoins'), 10);

        const missionInsertQuery = `
            INSERT INTO missoes (nome, descricao, duracao_minutos, recompensa_starcoins)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `;
        const missionResult = await db.query(missionInsertQuery, [missionName, missionDescription, missionDuration, missionStarcoins]);

        const missionId = missionResult.rows[0].id;

        await selectMissionItems(interaction, missionId);
        return submitted.reply({ content: `Missão "${missionName}" adicionada com sucesso!`, ephemeral: false });
    } catch (error) {
        console.error('[ERRO] Falha ao adicionar missão:', error);
        await menuInteraction.followUp({ content: 'Ocorreu um erro ao adicionar a missão.', ephemeral: true });
    }
}

async function selectMissionItems(interaction, missionId) {
    const itemsQuery = 'SELECT id, nome FROM itens';
    const itemsResult = await db.query(itemsQuery);
    const items = itemsResult.rows;

    const itemOptions = items.map(item => ({
        label: item.nome,
        value: `${item.id}`,
    }));

    const itemSelectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`add_mission_items_${missionId}`)
            .setPlaceholder('Selecione itens para a missão')
            .addOptions(itemOptions)
            .setMinValues(1)
            .setMaxValues(itemOptions.length)
    );

    await interaction.followUp({
        content: `Selecione os itens para a missão:`,
        components: [itemSelectMenu],
        ephemeral: false,
    });

    const collector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.customId.startsWith(`add_mission_items_${missionId}`),
        time: 300000,
    });

    collector.on('collect', async (i) => {
        const selectedItems = i.values;

        const modal = new ModalBuilder()
            .setCustomId(`quantities_modal_${missionId}`)
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

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({ time: 300000 }).catch(() => null);

        if (!submitted) {
            return i.reply({ content: 'Tempo esgotado para definir quantidades.', ephemeral: false });
        }

        for (const itemId of selectedItems) {
            const quantity = parseInt(submitted.fields.getTextInputValue(`quantity_item_${itemId}`), 10);
            await db.query('INSERT INTO missoes_recompensas (missao_id, item_id, quantidade) VALUES ($1, $2, $3)', [
                missionId,
                parseInt(itemId, 10),
                quantity,
            ]);
        }

        await submitted.reply({ content: 'Itens adicionados com sucesso!', ephemeral: false });
    });
}

// Excluir missão
async function handleDeleteMission(interaction, menuInteraction) {
    const missionsQuery = 'SELECT id, nome FROM missoes';
    const missionsResult = await db.query(missionsQuery);

    if (missionsResult.rowCount === 0) {
        return menuInteraction.reply({
            content: '❌ Não há missões para excluir.',
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
            .setCustomId('delete_mission_select')
            .setPlaceholder('Selecione uma missão para excluir')
            .addOptions(missionOptions)
    );

    await menuInteraction.reply({
        content: 'Selecione a missão que deseja excluir:',
        components: [selectMenu],
        ephemeral: false,
    });

    const deleteCollector = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && i.customId === 'delete_mission_select',
        time: 300000,
    });

    deleteCollector.on('collect', async (i) => {
        const missionId = parseInt(i.values[0], 10);
        const missionName = missions.find(m => m.id === missionId)?.nome;

        // Excluir missão
        await db.query('DELETE FROM missoes WHERE id = $1', [missionId]);
        await db.query('DELETE FROM missoes_recompensas WHERE missao_id = $1', [missionId]);

        await i.reply({ content: `Missão "${missionName}" foi excluída com sucesso!`, ephemeral: false });
    });

    deleteCollector.on('end', (_, reason) => {
        if (reason === 'time') {
            menuInteraction.followUp({ content: 'O tempo para excluir missões expirou.', ephemeral: false });
        }
    });
}
