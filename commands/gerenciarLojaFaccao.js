const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gerenciar-loja-faccao')
        .setDescription('Gerencia os itens da loja da facção')
        .addSubcommand(subcommand =>
    subcommand
        .setName('adicionar')
        .setDescription('Adiciona um novo item à loja da facção')
        .addStringOption(option =>
    option.setName('nome').setDescription('Nome do item').setRequired(true))
        .addStringOption(option =>
    option.setName('descricao').setDescription('Descrição do item').setRequired(true))
        .addIntegerOption(option =>
    option.setName('preco').setDescription('Preço do item').setRequired(true))
    )
        .addSubcommand(subcommand =>
    subcommand
        .setName('remover')
        .setDescription('Remove um item da loja da facção')
        .addStringOption(option =>
    option.setName('nome').setDescription('Nome do item a remover').setRequired(true))
    )
        .addSubcommand(subcommand =>
    subcommand
        .setName('modificar')
        .setDescription('Modifica um item existente na loja')
    ),
    async execute(interaction) {
        try {
            // Verificação de ID do usuário
            const allowedUserIds = ["249204720395223041", "347896392821243925", "980156816061255690"];
            if (!allowedUserIds.includes(interaction.user.id)) {
                return interaction.reply({
                    content: 'Apenas administradores autorizados podem usar este comando.',
                    ephemeral: true,
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'adicionar') {
                const itemName = interaction.options.getString('nome');
                const itemDesc = interaction.options.getString('descricao');
                const itemPrice = interaction.options.getInteger('preco');

                const addItemQuery = `
                    INSERT INTO loja_faccao (nome, descricao, preco)
                    VALUES ($1, $2, $3)
                `;
                await db.query(addItemQuery, [itemName, itemDesc, itemPrice]);

                return interaction.reply(`Item **${itemName}** adicionado à loja com sucesso!`);
            }

            if (subcommand === 'remover') {
                const itemName = interaction.options.getString('nome');

                const deleteItemQuery = `
                    DELETE FROM loja_faccao
                    WHERE nome = $1
                `;
                const deleteResult = await db.query(deleteItemQuery, [itemName]);

                if (deleteResult.rowCount === 0) {
                    return interaction.reply('Item não encontrado na loja.');
                }

                return interaction.reply(`Item **${itemName}** removido da loja com sucesso!`);
            }

            if (subcommand === 'modificar') {
                const fetchItemsQuery = `
                    SELECT id, nome, preco, descricao
                    FROM loja_faccao
                `;
                const itemsResult = await db.query(fetchItemsQuery);

                if (itemsResult.rowCount === 0) {
                    return interaction.reply('A loja está vazia. Adicione itens antes de tentar modificar.');
                }

                const lojaItens = itemsResult.rows;

                const itemSelectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select-item-to-modify')
                    .setPlaceholder('Selecione o item para modificar')
                    .addOptions(lojaItens.map(item => ({
                    label: item.nome,
                    description: `Preço: ${item.preco} StarCoins`,
                    value: item.id.toString(),
                })));

                const row = new ActionRowBuilder().addComponents(itemSelectMenu);

                await interaction.reply({
                    content: 'Selecione o item que deseja modificar:',
                    components: [row],
                    ephemeral: true,
                });

                const filter = i => i.customId === 'select-item-to-modify' && i.user.id === interaction.user.id;
                const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

                collector.on('collect', async i => {
                    try {
                        const selectedItemId = parseInt(i.values[0]);
                        const selectedItem = lojaItens.find(item => item.id === selectedItemId);

                        if (!selectedItem) {
                            return i.reply({ content: 'Item não encontrado.', ephemeral: true });
                        }

                        const newDesc = interaction.options.getString('descricao') || selectedItem.descricao;
                        const newPrice = interaction.options.getInteger('preco') || selectedItem.preco;

                        const updateItemQuery = `
                            UPDATE loja_faccao
                            SET descricao = $1, preco = $2
                            WHERE id = $3
                        `;
                        await db.query(updateItemQuery, [newDesc, newPrice, selectedItemId]);

                        await i.update({
                            content: `Item **${selectedItem.nome}** modificado com sucesso!\nNova descrição: ${newDesc}\nNovo preço: ${newPrice} StarCoins`,
                            components: [],
                        });
                    } catch (error) {
                        console.error('Erro ao modificar item:', error);
                        await i.reply({
                            content: 'Ocorreu um erro ao tentar modificar o item.',
                            ephemeral: true,
                        });
                    }
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        interaction.editReply({
                            content: 'Tempo esgotado. Nenhum item foi selecionado.',
                            components: [],
                        });
                    }
                });
            }
        } catch (error) {
            console.error('Erro ao gerenciar a loja da facção:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao tentar gerenciar a loja da facção.',
                ephemeral: true,
            });
        }
    },
};
