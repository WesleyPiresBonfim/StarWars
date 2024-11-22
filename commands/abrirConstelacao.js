const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const db = require('../database.js');

const CONSTELACOES_IMAGENS = {
    silver: 'https://media.discordapp.net/attachments/1300428798700814407/1308853831592972298/Silver.png?ex=673f749e&is=673e231e&hm=cff5006bd0338e6fb65b989e756036840130866b109a25d046a157a423b381ec&=&format=webp&quality=lossless&width=662&height=662',
    gold: 'https://media.discordapp.net/attachments/1300428798700814407/1308853873083023420/Gold.png?ex=673f74a8&is=673e2328&hm=955f01d98f0ffd0eb3a01fe5310da2b6b5e0537e698dd12fedf3f3a7f7f1ed0d&=&format=webp&quality=lossless&width=662&height=662',
    diamond: 'https://link-para-imagem-diamond.com/imagem.png',
    dream: 'https://link-para-imagem-dream.com/imagem.png',
    star: 'https://media.discordapp.net/attachments/1300428798700814407/1308855216891760640/Star3_MAIOR.png?ex=673f75e9&is=673e2469&hm=5d12adbe070e24c57cfe66f592bb71fd0eca921748b5b69ffed2c400020057f8&=&format=webp&quality=lossless&width=662&height=662',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('abrirconstelacao')
        .setDescription('Abra uma constelação e descubra o que ela contém.')
        .addStringOption(option =>
    option.setName('tipo')
        .setDescription('O tipo da constelação que você deseja abrir.')
        .setRequired(true)
    ),
    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const tipo = interaction.options.getString('tipo').toLowerCase();
            const validConstelacoes = ['silver', 'gold', 'diamond', 'dream', 'star'];
            const constelacao = validConstelacoes.find(c => c.includes(tipo));

            if (!constelacao) {
                return interaction.reply({
                    content: `Tipo de constelação inválido. Opções: Silver, Gold, Diamond, Dream, Star.`,
                    ephemeral: false,
                });
            }

            // Verificar se o usuário possui caixas da constelação
            const caixaQuery = `SELECT ${constelacao} FROM caixas WHERE user_id = $1`;
            const caixaResult = await db.query(caixaQuery, [userId]);

            if (caixaResult.rowCount === 0 || caixaResult.rows[0][constelacao] <= 0) {
                return interaction.reply({
                    content: `Você não possui nenhuma constelação ${constelacao.charAt(0).toUpperCase() + constelacao.slice(1)} para abrir.`,
                    ephemeral: false,
                });
            }

            // Buscar itens e chances da tabela caixas_itens
            const itensQuery = `SELECT item_id, chance FROM caixas_itens WHERE caixa_tipo = $1`;
            const itensResult = await db.query(itensQuery, [constelacao]);

            const itensRecebidos = [];
            if (itensResult.rowCount > 0) {
                const itensDisponiveis = itensResult.rows;

                for (const item of itensDisponiveis) {
                    if (Math.random() <= item.chance) {
                        itensRecebidos.push(item.item_id);
                    }
                }

                // Garantir que pelo menos um item seja recebido
                if (itensRecebidos.length === 0) {
                    const fallbackItem = itensDisponiveis[Math.floor(Math.random() * itensDisponiveis.length)];
                    itensRecebidos.push(fallbackItem.item_id);
                }
            }


            // Buscar os nomes dos itens recebidos
            let itensDetalhes = [];
            if (itensRecebidos.length > 0) {
                const nomesQuery = `SELECT id, nome FROM itens WHERE id = ANY($1)`;
                const nomesResult = await db.query(nomesQuery, [itensRecebidos]);
                itensDetalhes = nomesResult.rows;
            }

            // Atualizar tabela de caixas (remover 1 unidade)
            const updateCaixaQuery = `UPDATE caixas SET ${constelacao} = ${constelacao} - 1 WHERE user_id = $1`;
            await db.query(updateCaixaQuery, [userId]);

            // Atualizar inventário do usuário com os itens recebidos
            for (const item of itensDetalhes) {
                const insertInventoryQuery = `
                    INSERT INTO inventarios (user_id, item_id, quantidade)
                    VALUES ($1, $2, 1)
                    ON CONFLICT (user_id, item_id)
                    DO UPDATE SET quantidade = inventarios.quantidade + 1
                `;
                await db.query(insertInventoryQuery, [userId, item.id]);
            }

            // Atualizar saldo do usuário
            const recompensas = {
                silver: { min: 500, max: 1000 },
                gold: { min: 1500, max: 3000 },
                diamond: { min: 3500, max: 6000 },
                dream: { min: 7000, max: 10000 },
                star: { min: 10000, max: 15000 },
            };
            const recompensa = recompensas[constelacao];
            const dinheiro = Math.floor(Math.random() * (recompensa.max - recompensa.min + 1)) + recompensa.min;

            const updateSaldoQuery = `UPDATE users SET saldo = saldo + $1 WHERE user_id = $2`;
            await db.query(updateSaldoQuery, [dinheiro, userId]);

            // Criar embed de resposta
            const embed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle(`🌌 Você abriu uma Constelação ${constelacao.charAt(0).toUpperCase() + constelacao.slice(1)}!`)
                .setThumbnail(CONSTELACOES_IMAGENS[constelacao])
                .setDescription(
                `💰 **${dinheiro.toLocaleString('pt-BR')} StarCoins**\n` +
                `🎁 **Itens Recebidos:**\n` +
                (itensDetalhes.length
                ? itensDetalhes.map(item => `- ${item.nome}`).join('\n')
                : 'Nenhum item recebido.')
            )
                .setFooter({ text: 'Continue explorando as estrelas!' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao executar o comando /abrirconstelacao:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao tentar abrir a constelação. Por favor, tente novamente mais tarde.',
                ephemeral: true,
            });
        }
    },
};
