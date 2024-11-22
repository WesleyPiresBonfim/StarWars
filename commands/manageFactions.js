const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Função para carregar as facções do arquivo JSON
const loadFactions = () => {
    try {
        const data = fs.readFileSync(path.join(__dirname, '../data/factions.json'));
        return JSON.parse(data);
    } catch (error) {
        console.error('Erro ao carregar facções:', error);
        return { factions: [] };
    }
};

// Função para salvar as facções no arquivo JSON
const saveFactions = (factions) => {
    try {
        const factionsPath = path.join(__dirname, '../data/factions.json');
        fs.writeFileSync(factionsPath, JSON.stringify(factions, null, 2));
    } catch (error) {
        console.error('Erro ao salvar facções:', error);
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gerenciar-faccoes')
        .setDescription('Gerenciar facções.')
        .addSubcommand(subcommand =>
    subcommand
        .setName('limite')
        .setDescription('Define o limite global de membros.')
        .addIntegerOption(option =>
    option.setName('numero')
        .setDescription('Número máximo de membros por facção.')
        .setRequired(true)))
        .addSubcommand(subcommand =>
    subcommand
        .setName('visualizar')
        .setDescription('Exibe informações detalhadas sobre uma facção.'))
        .addSubcommand(subcommand =>
    subcommand
        .setName('remover')
        .setDescription('Remove uma facção.'))
        .addSubcommand(subcommand =>
    subcommand
        .setName('listar')
        .setDescription('Lista todas as facções existentes.'))
        .addSubcommand(subcommand =>
    subcommand
        .setName('trocar-lider')
        .setDescription('Troca o líder de uma facção.')
        .addUserOption(option =>
    option.setName('novo-lider')
        .setDescription('O novo líder da facção.')
        .setRequired(true))),
    async execute(interaction) {

        const statusFilePath = './data/status-servidores.json';

        function loadServerStatus() {
            if (!fs.existsSync(statusFilePath)) {
                return {};
            }
            return JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
        }

        const status = loadServerStatus();
        const serverId = interaction.guild.id;

        const serverStatus = status[serverId];
        if (!serverStatus || !serverStatus.habilitado) {
            return interaction.reply({
                content: 'O StarWars está desativado neste servidor.',
                ephemeral: true,
            });
        }

        const allowedRoleIds = ['1152754038341906482', '1156067828315725874', '1182960760977117245', '1306228862576758864'];
        const hasRole = allowedRoleIds.some(roleId => interaction.member.roles.cache.has(roleId));

        if (!hasRole) {
            return interaction.reply({
                content: 'Você não tem permissão para usar este comando.',
                ephemeral: true,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const factionsData = loadFactions();

        if (subcommand === 'limite') {
            const limite = interaction.options.getInteger('numero');
            return interaction.reply(`Limite de membros por facção definido para ${limite}.`);

        } else if (subcommand === 'visualizar' || subcommand === 'remover' || subcommand === 'trocar-lider') {
            // Cria o menu de seleção de facções
            const factionsSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`select-faction-${subcommand}`)
                .setPlaceholder('Selecione uma facção')
                .addOptions(factionsData.factions.map(faction => ({
                label: faction.nome,
                description: 'Clique para gerenciar esta facção',
                value: faction.nome
            })));

            const row = new ActionRowBuilder().addComponents(factionsSelectMenu);
            await interaction.reply({
                content: `Selecione uma facção para ${subcommand}.`,
                components: [row],
                ephemeral: false,
            });

            // Processa a seleção de facção para cada subcomando
            const filter = i => i.customId === `select-faction-${subcommand}` && i.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({ filter, max: 1, time: 60000 });

            collector.on('collect', async i => {
                const selectedFaction = i.values[0];
                const faction = factionsData.factions.find(f => f.nome === selectedFaction);

                if (subcommand === 'visualizar') {
                    const embed = new EmbedBuilder()
                        .setColor('#FF5733')
                        .setTitle(`Detalhes da Facção: ${faction.nome}`)
                        .setDescription(faction.descricao)
                        .addFields(
                        { name: 'Criador', value: `<@${faction.owner}>`, inline: true },
                        { name: 'Líder', value: `<@${faction.leader}>`, inline: true },
                        { name: 'Membros', value: faction.members.map(id => `<@${id}>`).join(', ') || 'Nenhum membro.' }
                    );

                    if (faction.emblema) embed.setThumbnail(faction.emblema);
                    await i.update({ embeds: [embed], components: [] });

                } else if (subcommand === 'remover') {
                    factionsData.factions = factionsData.factions.filter(f => f.nome !== faction.nome);
                    saveFactions(factionsData);
                    await i.update({ content: `A facção **${faction.nome}** foi removida com sucesso.`, components: [] });

                } else if (subcommand === 'trocar-lider') {
                    const newLeader = interaction.options.getUser('novo-lider');
                    if (!faction.members.includes(newLeader.id)) {
                        return i.update({ content: 'O novo líder precisa ser um membro da facção.', components: [] });
                    }

                    faction.leader = newLeader.id;
                    saveFactions(factionsData);
                    await i.update({ content: `O novo líder da facção **${faction.nome}** é agora <@${newLeader.id}>.`, components: [] });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({
                        content: 'Tempo esgotado. Nenhuma facção foi selecionada.',
                        components: []
                    });
                }
            });

        } else if (subcommand === 'listar') {
            const embed = new EmbedBuilder()
                .setColor('#FF5733')
                .setTitle('Lista de Facções')
                .setDescription(factionsData.factions.map(f => `• **${f.nome}**`).join('\n'));

            await interaction.reply({ embeds: [embed], ephemeral: false });
        }
    },
};
