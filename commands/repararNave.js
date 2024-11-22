const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reparar-nave')
        .setDescription('Repara uma parte específica da sua nave usando itens sintetizados.')
        .addStringOption(option =>
    option.setName('parte')
        .setDescription('Escolha a parte da nave que deseja reparar (casco, combustível, escudo ou suporte vital).')
        .setRequired(true)
        .addChoices(
        { name: 'Casco', value: 'casco' },
        { name: 'Combustível', value: 'combustivel' },
        { name: 'Escudo', value: 'escudo' },
        { name: 'Suporte Vital', value: 'suporte_vital' }
    )
    ),
    async execute(interaction) {
        const userId = interaction.user.id;
        const parteEscolhida = interaction.options.getString('parte');

        try {
            const naveQuery = `
                SELECT *
                FROM naves
                WHERE user_id = $1
            `;
            const naveResult = await db.query(naveQuery, [userId]);

            if (naveResult.rowCount === 0) {
                return interaction.reply({
                    content: '❌ Você ainda não possui uma nave. Construa sua primeira nave para continuar.',
                    ephemeral: false,
                });
            }

            const nave = naveResult.rows[0];

            let itensNecessarios = [];
            let descricaoReparo = '';

            if (parteEscolhida === 'casco') {
                itensNecessarios = [
                    { nome: 'Placa de Metal', quantidade: 3 },
                    { nome: 'Solda Plasmática', quantidade: 2 }
                ];
                descricaoReparo = 'Repara o casco da nave, aumentando sua resistência.';
            } else if (parteEscolhida === 'combustivel') {
                itensNecessarios = [
                    { nome: 'Capacitor de Energia', quantidade: 5 },
                    { nome: 'Núcleo de Hiperpropulsão', quantidade: 3 }
                ];
                descricaoReparo = 'Recarrega o combustível da nave para mantê-la em funcionamento.';
            } else if (parteEscolhida === 'escudo') {
                itensNecessarios = [
                    { nome: 'Prisma de Energia Vital', quantidade: 4 },
                    { nome: 'Placa de Metal', quantidade: 2 }
                ];
                descricaoReparo = 'Repara o escudo da nave, garantindo sua proteção.';
            } else if (parteEscolhida === 'suporte_vital') {
                itensNecessarios = [
                    { nome: 'Bloco de Nanocarbono', quantidade: 3 },
                    { nome: 'Capacitor de Energia', quantidade: 4 }
                ];
                descricaoReparo = 'Recarrega o suporte vital da nave, essencial para a sobrevivência da tripulação.';
            }

            const itensParaReparo = itensNecessarios.map(item =>
            `- **${item.nome}**: ${item.quantidade} unidade(s)`
            ).join('\n');

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`🛠️ Reparar Nave - ${parteEscolhida.charAt(0).toUpperCase() + parteEscolhida.slice(1)}`)
                .setDescription(descricaoReparo)
                .addFields(
                { name: 'Itens Necessários:', value: itensParaReparo, inline: false },
                { name: '⚠️ Atenção', value: 'Certifique-se de ter todos os itens necessários para o reparo.' }
            )
                .setFooter({ text: 'StarWars - Sistema de Naves' });

            const initialMessage = await interaction.reply({
                embeds: [embed],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('confirm_reparo')
                            .setLabel('Confirmar Reparação')
                            .setStyle(ButtonStyle.Primary)
                    )
                ],
                ephemeral: false,
            });

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id && i.customId === 'confirm_reparo',
                time: 30000,
            });

            collector.on('collect', async (buttonInteraction) => {
                try {
                    await initialMessage.delete();
                    await buttonInteraction.deferReply({ ephemeral: false });

                    const itensQuery = `
                        SELECT rc.nome, COALESCE(SUM(ic.quantidade), 0) AS quantidade
                        FROM inventarios_crafting ic
                        JOIN receitas_crafting rc ON ic.receita_id = rc.id
                        WHERE ic.user_id = $1
                        AND rc.nome = ANY($2::text[])
                        GROUP BY rc.nome
                    `;
                    const itensNecessariosNomes = itensNecessarios.map(item => item.nome);
                    const itensResult = await db.query(itensQuery, [userId, itensNecessariosNomes]);

                    const itensInsuficientes = [];
                    for (const item of itensNecessarios) {
                        const itemEncontrado = itensResult.rows.find(i => i.nome === item.nome);
                        if (!itemEncontrado || itemEncontrado.quantidade < item.quantidade) {
                            itensInsuficientes.push(`${item.nome} (Faltando: ${item.quantidade - (itemEncontrado?.quantidade || 0)})`);
                        }
                    }

                    if (itensInsuficientes.length > 0) {
                        await buttonInteraction.editReply({
                            content: `<@${userId}>\n❌ Faltam os seguintes itens para realizar o reparo:\n${itensInsuficientes.join('\n')}`,
                        });
                        collector.stop(); // Encerra o coletor após a interação
                        return;
                    }

                    for (const item of itensNecessarios) {
                        await db.query(`
                            UPDATE inventarios_crafting
                            SET quantidade = quantidade - $1
                            WHERE user_id = $2 AND receita_id = (SELECT id FROM receitas_crafting WHERE nome = $3)
                        `, [item.quantidade, userId, item.nome]);
                    }

                    const incremento = 10;
                    if (parteEscolhida === 'casco') nave.casco_atual = Math.min(nave.casco_maximo, nave.casco_atual + incremento);
                    if (parteEscolhida === 'combustivel') nave.combustivel_atual = Math.min(nave.combustivel_maximo, nave.combustivel_atual + incremento);
                    if (parteEscolhida === 'escudo') nave.escudo_atual = Math.min(nave.escudo_maximo, nave.escudo_atual + incremento);
                    if (parteEscolhida === 'suporte_vital') nave.suporte_vital_atual = Math.min(nave.suporte_vital_maximo, nave.suporte_vital_atual + incremento);

                    const porcentagemTotal = (nave.casco_atual + nave.combustivel_atual + nave.escudo_atual + nave.suporte_vital_atual) /
                    (nave.casco_maximo + nave.combustivel_maximo + nave.escudo_maximo + nave.suporte_vital_maximo);

                    nave.estado = porcentagemTotal >= 0.6 ? 'Operacional Normal' :
                    porcentagemTotal >= 0.35 ? 'Operacional Mínimo' :
                    'Necessita de Reparos';

                    await db.query(`
                        UPDATE naves
                        SET casco_atual = $1, combustivel_atual = $2, escudo_atual = $3, suporte_vital_atual = $4, estado = $5
                        WHERE user_id = $6
                    `, [nave.casco_atual, nave.combustivel_atual, nave.escudo_atual, nave.suporte_vital_atual, nave.estado, userId]);

                    await buttonInteraction.editReply({
                        content: `✅ Reparação de ${parteEscolhida.charAt(0).toUpperCase() + parteEscolhida.slice(1)} concluída com sucesso! Nave no estado: **${nave.estado}**`,
                    });

                    collector.stop(); // Encerra o coletor após uma interação bem-sucedida
                    return;
                } catch (error) {
                    console.error('[ERRO] Durante a coleta de interação:', error);
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'time') {
                    initialMessage.delete().catch(() => {});
                    interaction.followUp({
                        content: '⏳ O tempo para confirmar o reparo expirou.',
                    });
                }
            });
        } catch (error) {
            console.error('[ERRO] Falha ao processar o comando /reparar-nave:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Ocorreu um erro ao tentar reparar sua nave. Por favor, tente novamente mais tarde.',
                    ephemeral: true,
                });
            }
        }
    },
};
