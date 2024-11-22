const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('expedicao')
        .setDescription('Envie sua nave para uma expedição espacial ou finalize uma expedição ativa.'),

    async execute(interaction) {
        const userId = interaction.user.id;

        try {
            // Verificar se há uma expedição ativa
            const activeExpedicaoQuery = `
                SELECT ea.*, e.*, e.id AS expedicao_id
                FROM expedicoes_ativas ea
                JOIN expedicoes e ON ea.expedicao_id = e.id
                WHERE ea.user_id = $1
            `;
            const activeExpedicaoResult = await db.query(activeExpedicaoQuery, [userId]);

            if (activeExpedicaoResult.rowCount > 0) {
                const activeExpedicao = activeExpedicaoResult.rows[0];
                const now = new Date();
                const startTime = new Date(activeExpedicao.inicio);
                const elapsedTimeSeconds = Math.floor((now - startTime) / 1000);
                const totalTimeSeconds = activeExpedicao.duracao * 60;

                if (elapsedTimeSeconds < totalTimeSeconds) {
                    const remainingTimeMinutes = Math.ceil((totalTimeSeconds - elapsedTimeSeconds) / 60);
                    return interaction.reply({
                        content: `⏳ Sua expedição ainda está em andamento. Tempo restante: **${remainingTimeMinutes} minuto(s)**.`,
                        ephemeral: false,
                    });
                } else {
                    await finalizarExpedicao(interaction, activeExpedicao, userId);
                    return;
                }
            }

            // Recuperar estado da nave
            const naveQuery = `SELECT * FROM naves WHERE user_id = $1`;
            const naveResult = await db.query(naveQuery, [userId]);

            if (naveResult.rowCount === 0) {
                return interaction.reply({
                    content: '❌ Você ainda não possui uma nave. Construa sua primeira nave para continuar.',
                    ephemeral: true,
                });
            }

            const nave = naveResult.rows[0];

            if (nave.estado === 'Destruída') {
                return interaction.reply({
                    content: '❌ Sua nave está destruída. Construa uma nova nave antes de iniciar uma expedição.',
                    ephemeral: false,
                });
            }

            // Recuperar time vinculado
            const timeQuery = `
                SELECT atributos::jsonb AS atributos
                FROM times_vinculados
                WHERE user_id = $1
            `;
            const timeResult = await db.query(timeQuery, [userId]);

            if (timeResult.rowCount === 0) {
                return interaction.reply({
                    content: '❌ Você precisa vincular um time antes de iniciar uma expedição. Use o comando `/registrar`.',
                    ephemeral: true,
                });
            }

            const atributos = timeResult.rows[0].atributos;

            // Calcular bônus dos atributos
            const habilidade = parseFloat(atributos.habilidade.replace('`', '')) || 0;
            const velocidade = parseFloat(atributos.velocidade.replace('`', '')) || 0;
            const resistencia = parseFloat(atributos.resistencia.replace('`', '')) || 0;

            const habilidadeBonus = Math.min(habilidade * 0.05, 20);
            const velocidadeBonus = Math.min(velocidade * 0.05, 15);
            const resistenciaBonus = Math.min(resistencia * 0.05, 10);

            // Carregar destinos disponíveis
            const destinosQuery = `
                SELECT id, nome, descricao, dificuldade, duracao, combustivel_necessario, casco_minimo, escudo_minimo, suporte_vital_minimo
                FROM expedicoes
            `;
            const destinosResult = await db.query(destinosQuery);

            if (destinosResult.rowCount === 0) {
                return interaction.reply({
                    content: '❌ Não há destinos disponíveis no momento. Tente novamente mais tarde.',
                    ephemeral: true,
                });
            }

            const destinos = destinosResult.rows;

            // Criar embed inicial com a lista de destinos
            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('🌌 Destinos de Expedição Disponíveis')
                .setDescription('Escolha um destino para explorar e iniciar sua jornada.')
                .setFooter({ text: 'Selecione um destino no menu abaixo para ver os detalhes.' });

            const destinoOptions = destinos.map(dest => ({
                label: dest.nome.length > 100 ? dest.nome.slice(0, 97) + '...' : dest.nome,
                value: dest.id.toString(),
            }));

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_destino')
                    .setPlaceholder('Selecione um destino para explorar.')
                    .addOptions(destinoOptions)
            );

            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('start_expedicao')
                    .setLabel('Iniciar Expedição')
                    .setStyle('Success')
            );

            await interaction.reply({ embeds: [embed], components: [row] });

            let selectedDestinoId;

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                time: 300000,
            });

            collector.on('collect', async (i) => {
                if (i.customId === 'select_destino') {
                    selectedDestinoId = parseInt(i.values[0], 10);
                    const destino = destinos.find(dest => dest.id === selectedDestinoId);

                    const duracaoReduzida = destino.duracao * (1 - velocidadeBonus / 100);
                    const combustivelReduzido = destino.combustivel_necessario * (1 - habilidadeBonus / 100);
                    const cascoReduzido = destino.casco_minimo * (1 - resistenciaBonus / 100);

                    const recompensasQuery = `
                        SELECT ie.nome, re.quantidade
                        FROM recompensas_expedicoes re
                        JOIN itens_expedicoes ie ON re.item_expedicao_id = ie.id
                        WHERE re.expedicao_id = $1
                    `;
                    const recompensasResult = await db.query(recompensasQuery, [selectedDestinoId]);
                    const recompensas = recompensasResult.rows.map(r => `- ${r.quantidade}x ${r.nome}`).join('\n');

                    const detailEmbed = new EmbedBuilder()
                        .setColor('#00BFFF')
                        .setTitle(`🌌 Detalhes do Destino: ${destino.nome}`)
                        .setDescription(destino.descricao)
                        .addFields(
                        { name: 'Dificuldade', value: destino.dificuldade, inline: true },
                        { name: 'Duração', value: `${destino.duracao} minutos - ${velocidadeBonus}% (velocidade: ${atributos.velocidade}) = ${Math.ceil(duracaoReduzida)} minutos`, inline: false },
                        { name: 'Combustível Necessário', value: `${destino.combustivel_necessario} - ${habilidadeBonus}% (habilidade: ${atributos.habilidade}) = ${Math.ceil(combustivelReduzido)}`, inline: false },
                        { name: 'Casco Necessário', value: `${destino.casco_minimo}% - ${resistenciaBonus}% (resistência: ${atributos.resistencia}) = ${Math.ceil(cascoReduzido)}%`, inline: false },
                        { name: 'Recompensas', value: recompensas || 'Nenhuma recompensa definida', inline: false }
                    );

                    await i.update({ embeds: [detailEmbed], components: [buttonRow] });
                }

                if (i.customId === 'start_expedicao') {
                    if (!selectedDestinoId) {
                        return i.reply({
                            content: '❌ Você precisa selecionar um destino antes de iniciar.',
                            ephemeral: true,
                        });
                    }

                    const destino = destinos.find(dest => dest.id === selectedDestinoId);

                    // Verificar recursos mínimos
                    const possuiRequisitos = nave.casco_atual >= destino.casco_minimo &&
                    nave.combustivel_atual >= destino.combustivel_necessario &&
                    nave.escudo_atual >= destino.escudo_minimo &&
                    nave.suporte_vital_atual >= destino.suporte_vital_minimo;

                    if (!possuiRequisitos) {
                        await i.message.delete(); // Remove a mensagem inicial
                        const confirmEmbed = new EmbedBuilder()
                            .setColor('#FFCC00')
                            .setTitle('⚠️ Recursos insuficientes!')
                            .setDescription('Sua nave não atende aos requisitos mínimos para esta expedição. Deseja continuar?');

                        const confirmRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('confirm_expedicao')
                                .setLabel('Confirmar')
                                .setStyle('Danger'),
                            new ButtonBuilder()
                                .setCustomId('cancel_expedicao')
                                .setLabel('Cancelar')
                                .setStyle('Secondary')
                        );

                        const confirmMessage = await i.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: false });

                        const confirmCollector = i.channel.createMessageComponentCollector({
                            filter: c => c.user.id === userId,
                            time: 30000,
                        });

                        confirmCollector.on('collect', async (c) => {
                            if (c.customId === 'confirm_expedicao') {
                                await c.message.delete(); // Remove a mensagem inicial com os botões
                                await c.channel.send({ content: `🚀 Expedição iniciada para **${destino.nome}**! Boa sorte, comandante!` });
                                confirmCollector.stop(); // Para o coletor explicitamente
                                await iniciarExpedicao(interaction, destino, userId);
                            } else if (c.customId === 'cancel_expedicao') {
                                await c.message.delete(); // Remove a mensagem inicial com os botões
                                await c.channel.send({ content: '❌ Expedição cancelada.' });
                                confirmCollector.stop(); // Para o coletor explicitamente
                            }
                        });
                    } else {
                        await i.message.delete(); // Remove a mensagem inicial
                        await iniciarExpedicao(interaction, destino, userId);
                    }
                }

            });
        } catch (error) {
            console.error('Erro ao executar o comando expedicao:', error);
            await interaction.reply({
                content: '❌ Ocorreu um erro ao tentar processar sua expedição. Por favor, tente novamente.',
                ephemeral: true,
            });
        }
    },
};

async function iniciarExpedicao(interaction, destino, userId) {
    await db.query(`
        INSERT INTO expedicoes_ativas (user_id, expedicao_id, inicio)
        VALUES ($1, $2, NOW())
    `, [userId, destino.id]);
}


async function finalizarExpedicao(interaction, activeExpedicao, userId) {
    // Recuperar dados da nave
    const naveQuery = `SELECT * FROM naves WHERE user_id = $1`;
    const naveResult = await db.query(naveQuery, [userId]);
    if (naveResult.rowCount === 0) {
        return interaction.reply({
            content: '❌ Ocorreu um erro ao recuperar o status da nave.',
            ephemeral: true,
        });
    }
    const nave = naveResult.rows[0];

    // Garantir valores válidos para atributos da nave
    const cascoAtual = nave.casco_atual || 0;
    const combustivelAtual = nave.combustivel_atual || 0;
    const escudoAtual = nave.escudo_atual || 0;
    const suporteVitalAtual = nave.suporte_vital_atual || 0;

    const cascoMaximo = nave.casco_maximo || 0;
    const combustivelMaximo = nave.combustivel_maximo || 0;
    const escudoMaximo = nave.escudo_maximo || 0;
    const suporteVitalMaximo = nave.suporte_vital_maximo || 0;

    // Verificar se a nave possui os requisitos mínimos
    const possuiRequisitosMinimos =
    cascoAtual >= (activeExpedicao.casco_minimo || 0) &&
    combustivelAtual >= (activeExpedicao.combustivel_necessario || 0) &&
    escudoAtual >= (activeExpedicao.escudo_minimo || 0) &&
    suporteVitalAtual >= (activeExpedicao.suporte_vital_minimo || 0);

    // Caso não possua os requisitos mínimos, aplicar chance de quebra
    let quebrada = false;
    if (!possuiRequisitosMinimos) {
        quebrada = Math.random() < 0.3; // 50% de chance de quebra
    }

    if (quebrada) {
        await db.query(`
            UPDATE naves
            SET estado = 'Destruída',
                casco_atual = 0,
                combustivel_atual = 0,
                escudo_atual = 0,
                suporte_vital_atual = 0
            WHERE user_id = $1
        `, [userId]);

        // Remover expedição ativa
        await db.query(`DELETE FROM expedicoes_ativas WHERE user_id = $1`, [userId]);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 Expedição Falhou!')
                    .setDescription('Sua nave foi destruída durante a expedição. Nenhuma recompensa foi recebida.')
                    .addFields({ name: '🔧 Status da Nave', value: 'Destruída', inline: false })
            ],
            ephemeral: false,
        });
    }

    // Deduzir custos da expedição
    const cascoRestante = Math.max(cascoAtual - (activeExpedicao.casco_minimo || 0), 0);
    const combustivelRestante = Math.max(combustivelAtual - (activeExpedicao.combustivel_necessario || 0), 0);
    const escudoRestante = Math.max(escudoAtual - (activeExpedicao.escudo_minimo || 0), 0);
    const suporteVitalRestante = Math.max(suporteVitalAtual - (activeExpedicao.suporte_vital_minimo || 0), 0);

    // Atualizar os recursos e o estado da nave no banco de dados
    const novoEstado = determinarEstadoNave(
        cascoRestante,
        combustivelRestante,
        escudoRestante,
        suporteVitalRestante,
        cascoMaximo,
        combustivelMaximo,
        escudoMaximo,
        suporteVitalMaximo
    );

    await db.query(`
        UPDATE naves
        SET casco_atual = $1,
            combustivel_atual = $2,
            escudo_atual = $3,
            suporte_vital_atual = $4,
            estado = $5
        WHERE user_id = $6
    `, [
        cascoRestante,
        combustivelRestante,
        escudoRestante,
        suporteVitalRestante,
        novoEstado,
        userId
    ]);

    // Recuperar recompensas da expedição
    const recompensasQuery = `
        SELECT ie.id AS item_id, ie.nome, re.quantidade
        FROM recompensas_expedicoes re
        JOIN itens_expedicoes ie ON re.item_expedicao_id = ie.id
        WHERE re.expedicao_id = $1
    `;
    const recompensasResult = await db.query(recompensasQuery, [activeExpedicao.expedicao_id]);

    // Adicionar recompensas ao inventário
    const recompensas = [];
    for (const recompensa of recompensasResult.rows) {
        if (!recompensa.item_id) {
            console.error(`Erro: ID do item não encontrado para recompensa ${recompensa.nome}`);
            continue; // Ignorar recompensas inválidas
        }
        recompensas.push(`- ${recompensa.quantidade}x ${recompensa.nome}`);
        await db.query(`
            INSERT INTO inventarios (user_id, item_id, quantidade)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, item_id) DO UPDATE
            SET quantidade = inventarios.quantidade + EXCLUDED.quantidade
        `, [userId, recompensa.item_id, recompensa.quantidade]);
    }

    // Remover expedição ativa
    await db.query(`DELETE FROM expedicoes_ativas WHERE user_id = $1`, [userId]);

    // Enviar mensagem de sucesso
    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎉 Expedição Concluída!')
                .setDescription(
                `Sua expedição foi um sucesso! Aqui estão as recompensas:\n\n${recompensas.join('\n')}`
            )
                .addFields(
                { name: '🔧 Status da Nave após a Expedição:', value: '\u200B', inline: false },
                { name: '🚀 Tipo', value: nave.tipo_nave || 'Desconhecido', inline: true },
                { name: '🛠️ Casco', value: `${cascoRestante} / ${cascoMaximo}`, inline: true },
                { name: '⛽ Combustível', value: `${combustivelRestante} / ${combustivelMaximo}`, inline: true },
                { name: '🛡️ Escudo', value: `${escudoRestante} / ${escudoMaximo}`, inline: true },
                { name: '🌱 Suporte Vital', value: `${suporteVitalRestante} / ${suporteVitalMaximo}`, inline: true }
            )
        ],
    });
}

// Função auxiliar para determinar o estado da nave
function determinarEstadoNave(casco, combustivel, escudo, suporteVital, cascoMax, combustivelMax, escudoMax, suporteMax) {
    const porcentagemTotal = (casco + combustivel + escudo + suporteVital) / (cascoMax + combustivelMax + escudoMax + suporteMax);
    if (porcentagemTotal >= 0.6) return 'Operacional Normal';
    if (porcentagemTotal >= 0.35) return 'Operacional Mínimo';
    return 'Necessita de Reparos';
}
