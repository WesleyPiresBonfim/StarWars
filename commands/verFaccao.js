const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const db = require('../database.js'); // Importa o arquivo de conexão com o banco

// Mapa global para rastrear coletores ativos
const activeCollectors = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ver-faccao')
        .setDescription('Veja os detalhes de uma facção.'),
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: false }); // Previne expiração da interação inicial

            // Verificação de status do servidor
            const serverId = interaction.guild.id;
            const statusQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverStatus = await db.query(statusQuery, [serverId]);

            if (serverStatus.rowCount === 0 || !serverStatus.rows[0].habilitado) {
                return interaction.editReply({
                    content: 'O bot está desabilitado neste servidor.',
                });
            }

            // Busca todas as facções no banco
            const factionsQuery = 'SELECT * FROM factions';
            const factionsResult = await db.query(factionsQuery);

            if (factionsResult.rowCount === 0) {
                return interaction.editReply({
                    content: 'Nenhuma facção encontrada no sistema.',
                });
            }

            const factions = factionsResult.rows;

            // Cria um menu suspenso com todas as facções
            const factionsMenu = new StringSelectMenuBuilder()
                .setCustomId(`select-faction-${interaction.id}`) // Evita conflitos com IDs duplicados
                .setPlaceholder('Selecione uma facção para ver os detalhes');

            factions.forEach(faction => {
                factionsMenu.addOptions({
                    label: faction.nome,
                    value: faction.id.toString(),
                });
            });

            const row = new ActionRowBuilder().addComponents(factionsMenu);

            // Envia a interação inicial com o menu suspenso
            await interaction.editReply({
                content: 'Selecione uma facção para visualizar:',
                components: [row],
            });

            // Remove coletores antigos associados ao usuário
            if (activeCollectors.has(interaction.user.id)) {
                activeCollectors.get(interaction.user.id).stop();
                activeCollectors.delete(interaction.user.id);
            }

            // Coletor para seleção do menu
            const filter = i => i.customId === `select-faction-${interaction.id}` && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });

            activeCollectors.set(interaction.user.id, collector);

            collector.on('collect', async i => {
                try {
                    const selectedFactionId = parseInt(i.values[0]);
                    const faction = factions.find(f => f.id === selectedFactionId);

                    if (!faction) {
                        return i.reply({
                            content: `A facção com ID "${selectedFactionId}" não foi encontrada.`,
                            ephemeral: true,
                        });
                    }

                    // Criação da embed com detalhes da facção selecionada
                    const embed = new EmbedBuilder()
                        .setColor(faction.cor || '#FFFFFF')
                        .setTitle(`Detalhes da Facção: ${faction.nome}`)
                        .setDescription(faction.descricao || 'Sem descrição disponível.');

                    if (faction.emblema) {
                        embed.setThumbnail(faction.emblema);
                    }

                    embed.addFields(
                        { name: 'Criador:', value: `👑 <@${faction.owner_id}>`, inline: true },
                        { name: 'Líder:', value: `🌟 <@${faction.leader_id}>`, inline: true },
                        { name: 'StarCoins:', value: faction.saldo.toString(), inline: false }
                    );

                    // Processar membros
                    const membros = Array.isArray(faction.membros)
                    ? faction.membros
                    : faction.membros?.split(',') || [];
                    const membersList = membros.length > 0
                    ? membros.map(memberId => `<@${memberId}>`).join('\n')
                    : 'Nenhum membro adicionado.';
                    embed.addFields({ name: 'Membros:', value: membersList });

                    // Processar rivais
                    const rivais = Array.isArray(faction.rival)
                    ? faction.rival
                    : faction.rival?.split(',') || [];
                    const rivalsList = rivais.length > 0
                    ? rivais.map(rivalId => {
                        const rivalFaction = factions.find(f => f.id === parseInt(rivalId));
                        return rivalFaction ? `🛡️ ${rivalFaction.nome}` : `❓ Rival não encontrado (ID: ${rivalId})`;
                    }).join('\n')
                    : 'Nenhum rival definido.';
                    embed.addFields({ name: 'Rivais:', value: rivalsList });

                    await i.update({ embeds: [embed], components: [] });
                } catch (error) {
                    console.error('Erro ao processar a facção selecionada:', error);
                    if (!i.replied) {
                        await i.reply({
                            content: 'Ocorreu um erro ao tentar exibir os detalhes da facção.',
                            ephemeral: true,
                        });
                    }
                }
            });

            collector.on('end', async collected => {
                activeCollectors.delete(interaction.user.id);
                if (collected.size === 0) {
                    try {
                        await interaction.editReply({
                            content: 'Tempo esgotado. Nenhuma facção foi selecionada.',
                            components: [],
                        });
                    } catch (error) {
                        console.error('Erro ao editar resposta após tempo esgotado:', error);
                    }
                }
            });
        } catch (error) {
            console.error('Erro ao executar o comando ver-faccao:', error);
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: 'Ocorreu um erro ao tentar exibir as facções.',
                });
            } else {
                await interaction.reply({
                    content: 'Ocorreu um erro ao tentar exibir as facções.',
                    ephemeral: true,
                });
            }
        }
    },
};
