const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('receitas')
        .setDescription('Exibe todas as receitas disponíveis para crafting.'),
    async execute(interaction) {
        const receitasQuery = `
            SELECT
                rc.id AS receita_id,
                rc.nome AS item_produzido,
                ri.quantidade,
                itens_ing.nome AS ingrediente_nome
            FROM
                receitas_crafting rc
            JOIN
                receitas_ingredientes ri ON rc.id = ri.receita_id
            JOIN
                itens itens_ing ON ri.item_id = itens_ing.id
            ORDER BY
                rc.nome, itens_ing.nome
        `;

        const receitasResult = await db.query(receitasQuery);

        if (receitasResult.rowCount === 0) {
            return interaction.reply({
                content: '❌ Não há receitas disponíveis no momento.',
                ephemeral: true,
            });
        }

        const receitas = receitasResult.rows.reduce((acc, row) => {
            const { receita_id, item_produzido, ingrediente_nome, quantidade } = row;

            if (!acc[receita_id]) {
                acc[receita_id] = {
                    itemProduzido: item_produzido,
                    ingredientes: [],
                };
            }

            acc[receita_id].ingredientes.push({
                nome: ingrediente_nome,
                quantidade,
            });

            return acc;
        }, {});

        const embed = new EmbedBuilder()
            .setTitle('Receitas Disponíveis')
            .setColor('#00AAFF')
            .setDescription('Veja abaixo todas as receitas disponíveis para crafting:');

        Object.values(receitas).forEach((dadosReceita) => {
            const ingredientes = dadosReceita.ingredientes
                .map(ing => `- ${ing.nome}: ${ing.quantidade}`)
                .join('\n');

            embed.addFields({
                name: dadosReceita.itemProduzido,
                value: `**Ingredientes:**\n${ingredientes}`,
            });
        });

        await interaction.reply({ embeds: [embed] });
    },
};
