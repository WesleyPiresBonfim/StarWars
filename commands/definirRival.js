const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('definir-rival')
        .setDescription('Defina uma facção rival para outra.'),
    async execute(interaction) {
        try {
            // Verificar se o bot está habilitado no servidor
            const serverId = interaction.guild.id;
            const serverQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverStatus = await db.query(serverQuery, [serverId]);

            if (serverStatus.rowCount === 0 || !serverStatus.rows[0].habilitado) {
                return interaction.reply({
                    content: 'O StarWars está desativado neste servidor.',
                    ephemeral: true,
                });
            }

            // Obter todas as facções
            const factionsQuery = 'SELECT id, nome FROM factions';
            const factionsResult = await db.query(factionsQuery);

            if (factionsResult.rowCount === 0) {
                return interaction.reply({
                    content: 'Nenhuma facção foi encontrada no sistema.',
                    ephemeral: true,
                });
            }

            const factions = factionsResult.rows;

            // Criar menus suspensos para selecionar facções
            const factionsMenu1 = new StringSelectMenuBuilder()
                .setCustomId('select-faction1')
                .setPlaceholder('Selecione a primeira facção')
                .addOptions(factions.map(f => ({
                label: f.nome,
                value: f.id.toString(),
            })));

            const factionsMenu2 = new StringSelectMenuBuilder()
                .setCustomId('select-faction2')
                .setPlaceholder('Selecione a segunda facção')
                .addOptions(factions.map(f => ({
                label: f.nome,
                value: f.id.toString(),
            })));

            const row1 = new ActionRowBuilder().addComponents(factionsMenu1);
            const row2 = new ActionRowBuilder().addComponents(factionsMenu2);

            // Envia a interação inicial com os menus suspensos
            await interaction.reply({
                content: 'Selecione duas facções para definir como rivais:',
                components: [row1, row2],
                ephemeral: false,
            });

            // Gerenciar interações de seleção
            const collector = interaction.channel.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 30000,
            });

            let faccao1Id, faccao2Id;

            collector.on('collect', async i => {
                if (i.customId === 'select-faction1') {
                    faccao1Id = i.values[0];
                    await i.update({ content: `Primeira facção selecionada. Agora selecione a segunda facção:`, components: [row2] });
                } else if (i.customId === 'select-faction2') {
                    faccao2Id = i.values[0];
                    collector.stop();

                    // Validar se as facções selecionadas são diferentes
                    if (faccao1Id === faccao2Id) {
                        return interaction.followUp({
                            content: 'Uma facção não pode ser rival de si mesma!',
                            ephemeral: true,
                        });
                    }

                    // Buscar os rivais existentes
                    const getRivalsQuery = 'SELECT rival FROM factions WHERE id = $1';
                    const faccao1RivalsResult = await db.query(getRivalsQuery, [faccao1Id]);
                    const faccao2RivalsResult = await db.query(getRivalsQuery, [faccao2Id]);

                    let faccao1Rivals = faccao1RivalsResult.rows[0]?.rival ? faccao1RivalsResult.rows[0].rival.split(',') : [];
                    let faccao2Rivals = faccao2RivalsResult.rows[0]?.rival ? faccao2RivalsResult.rows[0].rival.split(',') : [];

                    // Adicionar os novos rivais
                    if (!faccao1Rivals.includes(faccao2Id)) faccao1Rivals.push(faccao2Id);
                    if (!faccao2Rivals.includes(faccao1Id)) faccao2Rivals.push(faccao1Id);

                    // Atualizar o banco de dados
                    const updateRivalQuery = 'UPDATE factions SET rival = $1 WHERE id = $2';
                    await db.query(updateRivalQuery, [faccao1Rivals.join(','), faccao1Id]);
                    await db.query(updateRivalQuery, [faccao2Rivals.join(','), faccao2Id]);

                    // Responder com sucesso
                    const faccao1Nome = factions.find(f => f.id.toString() === faccao1Id).nome;
                    const faccao2Nome = factions.find(f => f.id.toString() === faccao2Id).nome;

                    return interaction.followUp({
                        content: `A facção **${faccao1Nome}** agora é rival de **${faccao2Nome}**.`,
                        ephemeral: false,
                    });
                }
            });

            collector.on('end', collected => {
                if (!faccao1Id || !faccao2Id) {
                    interaction.followUp({
                        content: 'Tempo esgotado ou facções não selecionadas.',
                        ephemeral: false,
                    });
                }
            });
        } catch (error) {
            console.error('Erro ao definir rivais:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao tentar definir facções como rivais.',
                ephemeral: true,
            });
        }
    },
};
