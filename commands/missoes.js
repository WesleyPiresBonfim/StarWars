const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('missao')
        .setDescription('Inicia ou finaliza uma missão para coletar recursos.'),

    async execute(interaction) {
        const userId = interaction.user.id;

        console.log(`[LOG] Comando /missao executado por ${userId}`);

        try {
            // Verificar se o jogador possui uma missão ativa
            const checkActiveMissionQuery = 'SELECT * FROM missoes_ativas WHERE user_id = $1';
            const activeMissionResult = await db.query(checkActiveMissionQuery, [userId]);

            if (activeMissionResult.rowCount > 0) {
                const activeMission = activeMissionResult.rows[0];
                const now = new Date();
                const startTime = new Date(activeMission.inicio);
                const elapsedTimeSeconds = Math.floor((now - startTime) / 1000);
                const totalTimeSeconds = activeMission.duracao_minutos * 60;

                if (elapsedTimeSeconds < totalTimeSeconds) {
                    const remainingTimeMinutes = Math.ceil((totalTimeSeconds - elapsedTimeSeconds) / 60);
                    return interaction.reply({
                        content: `⏳ Você já está em uma missão. Tempo restante: **${remainingTimeMinutes} minuto(s)**.`,
                        ephemeral: false,
                    });
                } else {
                    // Finalizar missão
                    await finalizarMissao(interaction, activeMission, userId);
                    return;
                }
            }

            // Carregar missões disponíveis e recompensas
            const availableMissionsQuery = `
                SELECT m.id, m.nome, m.descricao, m.duracao_minutos, m.recompensa_starcoins
                FROM missoes m
            `;
            const availableMissionsResult = await db.query(availableMissionsQuery);

            if (availableMissionsResult.rowCount === 0) {
                return interaction.reply({
                    content: '❌ Não há missões disponíveis no momento. Tente novamente mais tarde.',
                    ephemeral: true,
                });
            }

            const missions = availableMissionsResult.rows;

            // Adicionar itens de cada missão
            for (const mission of missions) {
                const fetchMissionItemsQuery = `
                    SELECT i.nome, mi.quantidade
                    FROM missoes_itens mi
                    JOIN itens i ON mi.item_id = i.id
                    WHERE mi.missao_id = $1
                `;
                const missionItemsResult = await db.query(fetchMissionItemsQuery, [mission.id]);
                mission.items = missionItemsResult.rows;
            }

            // Criar embed inicial com a lista das missões disponíveis
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🌟 Missões Disponíveis')
                .setDescription('Escolha uma missão para começar sua jornada e coletar recompensas.')
                .setFooter({ text: 'Selecione uma missão no menu abaixo para iniciar.' });

            // Criar menu de seleção
            const missionOptions = missions.map((mission) => ({
                label: mission.nome.length > 100 ? mission.nome.slice(0, 97) + '...' : mission.nome,
                //description: mission.descricao.length > 100 ? mission.descricao.slice(0, 97) + '...' : mission.descricao,
                value: mission.id.toString(),
            }));

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_mission')
                    .setPlaceholder('Selecione uma missão para iniciar.')
                    .addOptions(missionOptions)
            );

            // Criar botão para iniciar missão
            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('start_mission')
                    .setLabel('Iniciar Missão')
                    .setStyle('Success')
            );

            await interaction.reply({ embeds: [embed], components: [row, buttonRow] });

            console.log(`[LOG] Menu de missões enviado para ${userId}`);

            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                time: 300000, // 5 minutos
            });

            let selectedMissionId; // Variável para armazenar a missão selecionada

            collector.on('collect', async (i) => {
                if (i.customId === 'select_mission') {
                    // Atualizar a missão selecionada com base na escolha do usuário
                    selectedMissionId = parseInt(i.values[0], 10);
                    const selectedMission = missions.find((mission) => mission.id === selectedMissionId);

                    // Exibir informações completas da missão após selecionar no dropdown
                    const detailEmbed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle(`🌟 Detalhes da Missão: ${selectedMission.nome}`)
                        .setDescription(selectedMission.descricao)
                        .addFields(
                        { name: 'Duração', value: `${selectedMission.duracao_minutos} minutos` },
                        { name: 'Recompensa', value: `${selectedMission.recompensa_starcoins} StarCoins` },
                        { name: 'Itens Recompensados', value: selectedMission.items.length > 0
                        ? selectedMission.items.map(item => `- ${item.nome}: ${item.quantidade}`).join('\n')
                        : 'Nenhuma recompensa.' }
                    );

                    console.log(`[LOG] Exibindo detalhes da missão: ${selectedMission.nome}`);

                    // Atualizar a embed com as informações da missão e o botão de iniciar
                    await i.update({
                        embeds: [detailEmbed],
                        components: [row, buttonRow],
                    });
                }

                if (i.customId === 'start_mission') {
                    // Verificar se uma missão foi selecionada
                    if (!selectedMissionId) {
                        return i.reply({
                            content: '❌ Você precisa selecionar uma missão antes de iniciar.',
                            ephemeral: true,
                        });
                    }

                    console.log(`[LOG] Iniciando missão com ID: ${selectedMissionId}`);

                    // Deletar a mensagem inicial
                    try {
                        await i.message.delete(); // Remove a mensagem inicial com dropdown e botão
                        console.log('[LOG] Mensagem inicial deletada.');
                    } catch (error) {
                        console.error('[LOG] Erro ao deletar a mensagem inicial:', error);
                    }

                    // Inserir missão ativa no banco de dados
                    const selectedMission = missions.find(mission => mission.id === selectedMissionId);

                    await iniciarMissao(interaction, selectedMission, userId);
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'time') {
                    console.log(`[LOG] Tempo esgotado para o menu de missões de ${userId}`);
                }
            });
        } catch (error) {
            console.error('Erro ao executar o comando missao:', error);
            return interaction.reply({
                content: '❌ Ocorreu um erro ao tentar processar sua missão. Por favor, tente novamente.',
                ephemeral: true,
            });
        }
    },
};

async function iniciarMissao(interaction, selectedMission, userId) {
    const insertActiveMissionQuery = `
        INSERT INTO missoes_ativas (user_id, missao_id, inicio, duracao_minutos, recompensa_starcoins, id)
        VALUES ($1, $2, NOW(), $3, $4, DEFAULT)
    `;
    await db.query(insertActiveMissionQuery, [
        userId,
        selectedMission.id,
        selectedMission.duracao_minutos,
        selectedMission.recompensa_starcoins || 0,
    ]);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🚀 Missão Iniciada!')
        .setDescription(
        `Você iniciou a missão: **${selectedMission.nome}**\n\n` +
        `⏱️ **Duração:** ${selectedMission.duracao_minutos} minutos\n` +
        `Volte após o tempo para finalizar e coletar sua recompensa!`
    );

    await interaction.followUp({content: `<@${userId}>`, embeds: [embed], ephemeral: false });

    iniciarEventoAleatorio(interaction, selectedMission, userId);
}

async function finalizarMissao(interaction, activeMission, userId) {
    // Buscar recompensas da missão principal
    const fetchRewardsQuery = `
        SELECT i.nome, mi.quantidade
        FROM missoes_itens mi
        JOIN itens i ON mi.item_id = i.id
        WHERE mi.missao_id = $1
    `;
    const rewardsResult = await db.query(fetchRewardsQuery, [activeMission.missao_id]);
    const rewards = rewardsResult.rows;

    // Adicionar recompensas da missão principal ao inventário
    for (const reward of rewards) {
        await db.query(
            `INSERT INTO inventarios (user_id, item_id, quantidade)
             VALUES ($1, (SELECT id FROM itens WHERE nome = $2), $3)
             ON CONFLICT (user_id, item_id) DO UPDATE
             SET quantidade = inventarios.quantidade + EXCLUDED.quantidade`,
            [userId, reward.nome, reward.quantidade]
        );
    }

    // Atualizar saldo do jogador com recompensas da missão principal
    await db.query('UPDATE users SET saldo = saldo + $1 WHERE user_id = $2', [activeMission.recompensa_starcoins, userId]);

    // Buscar ID da missão ativa
    const activeMissionQuery = `
        SELECT id FROM missoes_ativas
        WHERE user_id = $1 AND missao_id = $2
    `;
    const activeMissionIdResult = await db.query(activeMissionQuery, [userId, activeMission.missao_id]);
    const activeMissionId = activeMissionIdResult.rows[0]?.id;

    if (!activeMissionId) {
        console.error('[LOG] ID da missão ativa não encontrado!');
        return interaction.reply({ content: 'Erro ao finalizar a missão.', ephemeral: true });
    }

    // Buscar eventos aceitos relacionados à missão ativa
    const logEventosQuery = `
        SELECT
            e.descricao,
            le.status,
            e.recompensa_starcoins,
            e.penalidade_starcoins,
            e.item_recompensa,
            e.quantidade_item_recompensa,
            i.nome AS item_nome
        FROM log_eventos le
        JOIN eventos_missoes e ON le.evento_id = e.id
        LEFT JOIN itens i ON e.item_recompensa = i.id
        WHERE le.user_id = $1 AND le.missao_ativa_id = $2 AND le.status = 'aceito'
    `;
    const logEventosResult = await db.query(logEventosQuery, [userId, activeMissionId]);

    // Processar recompensas/penalidades dos eventos aceitos
    for (const evento of logEventosResult.rows) {
        // Aplicar StarCoins ganhos
        if (evento.recompensa_starcoins) {
            await db.query(
                'UPDATE users SET saldo = saldo + $1 WHERE user_id = $2',
                [evento.recompensa_starcoins, userId]
            );
        }

        // Aplicar StarCoins perdidos
        if (evento.penalidade_starcoins) {
            await db.query(
                'UPDATE users SET saldo = saldo - $1 WHERE user_id = $2',
                [evento.penalidade_starcoins, userId]
            );
        }

        // Adicionar itens recebidos
        if (evento.item_recompensa) {
            await db.query(
                `INSERT INTO inventarios (user_id, item_id, quantidade)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, item_id) DO UPDATE
                 SET quantidade = inventarios.quantidade + EXCLUDED.quantidade`,
                [userId, evento.item_recompensa, evento.quantidade_item_recompensa]
            );
        }
    }

    // Gerar resumo dos eventos aceitos
    const eventosDetalhes = logEventosResult.rows
        .map(e =>
    `- ${e.descricao}:\n` +
    `${e.recompensa_starcoins ? `💰 +${e.recompensa_starcoins} StarCoins\n` : ''}` +
    `${e.penalidade_starcoins ? `💸 -${e.penalidade_starcoins} StarCoins\n` : ''}` +
    `${e.item_nome ? `🛠️ Item Recebido: ${e.item_nome} (${e.quantidade_item_recompensa} unidade(s))\n` : ''}`
    )
        .join('\n');

    // Deletar missão ativa
    await db.query('DELETE FROM missoes_ativas WHERE user_id = $1', [userId]);

    // Montar embed de finalização
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 Missão Concluída!')
        .setDescription(
        `Você completou sua missão com sucesso! Aqui estão os resultados:\n\n` +
        `💰 **${activeMission.recompensa_starcoins} StarCoins**\n` +
        `🛠️ **Itens Recebidos:**\n` +
        (rewards.length > 0
        ? rewards.map(r => `- ${r.nome}: ${r.quantidade}`).join('\n')
        : 'Nenhum item recebido.') +
        `\n\n📜 **Eventos Durante a Missão:**\n${eventosDetalhes || 'Nenhum evento registrado.'}`
    )
        .setFooter({ text: 'Use /missao para iniciar outra missão.' });

    return interaction.reply({ embeds: [embed] });
}


async function iniciarEventoAleatorio(interaction, selectedMission, userId) {
    const duracaoMissao = selectedMission.duracao_minutos * 60 * 1000; // Converter para ms
    const tempoAleatorio = Math.random() * duracaoMissao;

    setTimeout(async () => {
        const evento = await db.query(`SELECT em.id as evento_id, em.descricao as evento_descricao, em.tipo as evento_tipo, em.recompensa_starcoins as evento_recompensa_starcoins, em.penalidade_starcoins as evento_penalidade_starcoins,
        em.item_recompensa as evento_item_recompensa, em.quantidade_item_recompensa as evento_quantidade_item_recompensa, em.penalidade_vida as evento_penalidade_vida, i.id as item_id, i.nome as item_nome,
        i.raridade as item_raridade, i.descricao as item_descricao FROM eventos_missoes em LEFT JOIN itens i ON item_recompensa = i.id ORDER BY RANDOM() LIMIT 1`);
        if (evento.rowCount === 0) return;

        const eventoSelecionado = evento.rows[0];

        // Obter a missão ativa atual
        const missaoAtiva = await db.query(
            'SELECT * FROM missoes_ativas WHERE user_id = $1 AND missao_id = $2',
            [userId, selectedMission.id]
        );

        if (missaoAtiva.rowCount === 0) return;

        const missaoAtivaId = missaoAtiva.rows[0].id;

        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('🎲 Evento Aleatório!')
            .setDescription(
            `**${eventoSelecionado.evento_descricao}**`
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`aceitar_${eventoSelecionado.evento_id}`)
                .setLabel('Aceitar')
                .setStyle('Success'),
            new ButtonBuilder()
                .setCustomId(`recusar_${eventoSelecionado.evento_id}`)
                .setLabel('Recusar')
                .setStyle('Danger')
        );

        const canal = interaction.channel;
        const mensagem = await canal.send({ content: `<@${userId}>`, embeds: [embed], components: [row] });

        const collector = mensagem.createMessageComponentCollector({
            filter: (i) => i.user.id === userId,
            time: 120000, // 2 minutos
        });

        collector.on('collect', async (i) => {
            if (i.customId.startsWith('aceitar')) {
                await db.query(
                    `INSERT INTO log_eventos (user_id, missao_id, evento_id, status, missao_ativa_id)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [userId, selectedMission.id, eventoSelecionado.evento_id, 'aceito', missaoAtivaId]
                );

                await i.update({
                    embeds: [embed.setDescription(
                        `**${eventoSelecionado.evento_descricao}**\n\n` +
                        `💰 **+${eventoSelecionado.evento_recompensa_starcoins || 0} StarCoins**\n` +
                        `${eventoSelecionado.evento_item_recompensa ? `🛠️ +${eventoSelecionado.item_nome} (${eventoSelecionado.evento_quantidade_item_recompensa})` : ''}**\n\nStatus: **Aceito** ✅`)],
                    components: [],
                });

                if (eventoSelecionado.evento_recompensa_starcoins) {
                    await db.query(
                        `UPDATE users SET saldo = saldo + $1 WHERE user_id = $2`,
                        [eventoSelecionado.evento_recompensa_starcoins, userId]
                    );
                }
                if (eventoSelecionado.evento_item_recompensa) {
                    await db.query(
                        `INSERT INTO inventarios (user_id, item_id, quantidade)
                         VALUES ($1, $2, $3)
                         ON CONFLICT (user_id, item_id) DO UPDATE
                         SET quantidade = inventarios.quantidade + EXCLUDED.quantidade`,
                        [userId, eventoSelecionado.evento_item_recompensa, eventoSelecionado.evento_quantidade_item_recompensa]
                    );
                }
            } else if (i.customId.startsWith('recusar')) {
                await db.query(
                    `INSERT INTO log_eventos (user_id, missao_id, evento_id, status, missao_ativa_id)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [userId, selectedMission.id, eventoSelecionado.evento_id, 'recusado', missaoAtivaId]
                );

                await i.update({
                    embeds: [embed.setDescription(`**${eventoSelecionado.evento_descricao}**\n\nStatus: **Recusado** ❌`)],
                    components: [],
                });
            }
            collector.stop();
        });

        collector.on('end', (_, reason) => {
            if (reason === 'time') {
                mensagem.edit({
                    embeds: [embed.setDescription(`**${eventoSelecionado.evento_descricao}**\n\nStatus: **Tempo Esgotado** ⏳`)],
                    components: [],
                });
            }
        });
    }, tempoAleatorio);
}

