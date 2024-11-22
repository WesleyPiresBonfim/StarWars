const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database.js');
const cooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sintetizar')
        .setDescription('Permite fabricar itens com base nas receitas disponíveis.'),
    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const cooldownTime = 7000; // Cooldown global (7 segundos)

            // Implementar cooldown global
            if (cooldowns.has(userId)) {
                const lastUsed = cooldowns.get(userId);
                const now = Date.now();

                if (now - lastUsed < cooldownTime) {
                    const timeLeft = ((cooldownTime - (now - lastUsed)) / 1000).toFixed(1);
                    return interaction.reply({
                        content: `⏳ Aguarde ${timeLeft} segundos antes de usar este comando novamente.`,
                        ephemeral: false, // Tornar visível para todos
                    });
                }
            }

            // Defere a interação para evitar expiração
            await interaction.deferReply({ ephemeral: false }); // Tornar visível para todos

            // Atualizar o cooldown
            cooldowns.set(userId, Date.now());

            // Buscar receitas disponíveis
            const receitasQuery = `
                SELECT
                    rc.id AS receita_id,
                    rc.nome AS item_produzido
                FROM receitas_crafting rc
            `;
            const receitasResult = await db.query(receitasQuery);

            if (receitasResult.rowCount === 0) {
                return interaction.editReply({
                    content: '❌ Não há receitas disponíveis no momento.',
                });
            }

            const receitas = receitasResult.rows;
            const receitasOptions = receitas.map(r => ({
                label: r.item_produzido,
                value: `${r.receita_id}`,
            }));

            const selectMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_crafting_recipe')
                    .setPlaceholder('Selecione uma receita para fabricar')
                    .addOptions(receitasOptions)
            );

            await interaction.editReply({
                content: 'Escolha uma receita para fabricar:',
                components: [selectMenu],
            });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id && i.customId === 'select_crafting_recipe',
                time: 300000, // 5 minutos
            });

            collector.on('collect', async (i) => {
                try {
                    await i.deferReply({ ephemeral: false }); // Tornar visível para todos

                    const receitaId = parseInt(i.values[0], 10);

                    // Buscar informações da receita
                    const receitaQuery = `
                        SELECT rc.nome AS receita_nome
                        FROM receitas_crafting rc
                        WHERE rc.id = $1
                    `;
                    const receitaResult = await db.query(receitaQuery, [receitaId]);

                    if (receitaResult.rowCount === 0) {
                        return i.editReply({
                            content: '❌ Receita não encontrada.',
                        });
                    }

                    const receita = receitaResult.rows[0].receita_nome;

                    // Buscar ingredientes da receita
                    const ingredientesQuery = `
                        SELECT
                            ri.item_id,
                            ri.quantidade,
                            itens_ing.nome
                        FROM receitas_ingredientes ri
                        JOIN itens itens_ing ON ri.item_id = itens_ing.id
                        WHERE ri.receita_id = $1
                    `;
                    const ingredientesResult = await db.query(ingredientesQuery, [receitaId]);
                    const ingredientes = ingredientesResult.rows;

                    if (ingredientes.length === 0) {
                        return i.editReply({
                            content: '❌ Não foram encontrados ingredientes para esta receita.',
                        });
                    }

                    // Verificar se o jogador possui os ingredientes necessários
                    const verificacaoQuery = `
                        SELECT item_id, quantidade
                        FROM inventarios
                        WHERE user_id = $1 AND item_id = ANY($2::int[])
                    `;
                    const itemIds = ingredientes.map(ing => ing.item_id);
                    const inventarioResult = await db.query(verificacaoQuery, [interaction.user.id, itemIds]);

                    const inventario = Object.fromEntries(
                        inventarioResult.rows.map(row => [row.item_id, row.quantidade])
                    );

                    const faltantes = ingredientes.filter(ing => {
                        return !inventario[ing.item_id] || inventario[ing.item_id] < ing.quantidade;
                    });

                    if (faltantes.length > 0) {
                        const faltantesLista = faltantes.map(f => `${f.nome} (Faltando: ${f.quantidade - (inventario[f.item_id] || 0)})`);
                        return i.editReply({
                            content: `❌ Você não possui os ingredientes necessários:\n${faltantesLista.join('\n')}`,
                        });
                    }

                    // Consumir ingredientes e adicionar o item fabricado
                    for (const ing of ingredientes) {
                        await db.query(
                            `
                            UPDATE inventarios
                            SET quantidade = quantidade - $1
                            WHERE user_id = $2 AND item_id = $3
                            `,
                            [ing.quantidade, interaction.user.id, ing.item_id]
                        );

                        await db.query(
                            `
                            DELETE FROM inventarios
                            WHERE user_id = $1 AND item_id = $2 AND quantidade <= 0
                            `,
                            [interaction.user.id, ing.item_id]
                        );
                    }

                    await db.query(
                        `
                        INSERT INTO inventarios_crafting (user_id, receita_id, quantidade)
                        VALUES ($1, $2, 1)
                        ON CONFLICT (user_id, receita_id)
                        DO UPDATE SET quantidade = inventarios_crafting.quantidade + 1
                        `,
                        [interaction.user.id, receitaId]
                    );

                    await i.editReply({
                        content: `✅ ${receita} fabricado com sucesso!`,
                    });
                } catch (error) {
                    console.error('[ERRO] Falha ao processar a interação de sintetizar:', error);
                    await i.editReply({
                        content: '❌ Ocorreu um erro ao tentar fabricar o item.',
                    });
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'time') {
                    interaction.editReply({
                        content: '⏳ O tempo para selecionar uma receita expirou.',
                        components: [],
                    }).catch(() => {});
                }
            });
        } catch (error) {
            console.error('[ERRO] Falha ao processar o comando /sintetizar:', error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '❌ Ocorreu um erro ao tentar fabricar o item.',
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: '❌ Ocorreu um erro ao tentar fabricar o item.',
                    ephemeral: true,
                });
            }
        }
    },
};
