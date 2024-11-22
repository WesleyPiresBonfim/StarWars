const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventario')
        .setDescription('Exibe o inventário de itens do jogador.')
        .addStringOption(option =>
    option.setName('raridade')
        .setDescription('Filtrar itens por raridade.')
        .setRequired(false)
        .addChoices(
        { name: 'Comum', value: 'Comum' },
        { name: 'Raro', value: 'Raro' },
        { name: 'Épico', value: 'Épico' },
        { name: 'Lendário', value: 'Lendário' }
    )
    ),
    async execute(interaction) {
        const userId = interaction.user.id;
        const raridade = interaction.options.getString('raridade');

        try {
            // Query para buscar os itens do inventário regular e de crafting
            const query = `
                SELECT
                    i.nome,
                    i.descricao,
                    i.raridade,
                    inv.quantidade
                FROM inventarios inv
                JOIN itens i ON inv.item_id = i.id
                WHERE inv.user_id = $1
                ${raridade ? 'AND i.raridade = $2' : ''}

                UNION ALL

                SELECT
                    rc.nome AS nome,
                    'Produzido via crafting' AS descricao,
                    'Crafting' AS raridade,
                    inv_c.quantidade
                FROM inventarios_crafting inv_c
                JOIN receitas_crafting rc ON inv_c.receita_id = rc.id
                WHERE inv_c.user_id = $1
                ORDER BY raridade DESC, nome ASC
            `;

            const params = raridade ? [userId, raridade] : [userId];
            const result = await db.query(query, params);

            if (result.rowCount === 0) {
                return interaction.reply({
                    content: '❌ Você não possui itens no inventário.',
                    ephemeral: false,
                });
            }

            // Criar embed personalizada com tema de guerra
            const embed = new EmbedBuilder()
                .setTitle('⚔️ Inventário de Guerra')
                .setColor('#FF4500')
                .setDescription(
                raridade
                ? `Você está visualizando itens de raridade **${raridade.toUpperCase()}**.`
                : 'Todos os itens do seu arsenal estão listados abaixo.'
            )
                .setFooter({
                text: 'Prepare-se para a batalha!',
                iconURL: 'https://example.com/battle-icon.png', // Substituir por um ícone temático
            })
                .setTimestamp();

            result.rows.forEach(item => {
                const emoji = getRarityEmoji(item.raridade); // Função para emojis de raridade
                embed.addFields({
                    name: `${emoji} ${item.nome} (${item.raridade.toUpperCase()})`,
                    value: `📜 **Descrição:** ${item.descricao}\n🎒 **Quantidade:** ${item.quantidade}`,
                });
            });

            await interaction.reply({ embeds: [embed], ephemeral: false });
        } catch (error) {
            console.error('[ERRO] Falha ao exibir o inventário:', error);
            return interaction.reply({
                content: '❌ Ocorreu um erro ao tentar acessar seu inventário.',
                ephemeral: true,
            });
        }
    },
};

// Função para associar emojis com as raridades
function getRarityEmoji(raridade) {
    switch (raridade) {
        case 'Comum':
            return '⚪'; // Emoji para itens comuns
        case 'Raro':
            return '🔵'; // Emoji para itens raros
        case 'Épico':
            return '🟣'; // Emoji para itens épicos
        case 'Lendário':
            return '🟠'; // Emoji para itens lendários
        case 'Crafting':
            return '⚙️'; // Emoji para itens produzidos por crafting
        default:
            return '❔'; // Emoji padrão
    }
}
