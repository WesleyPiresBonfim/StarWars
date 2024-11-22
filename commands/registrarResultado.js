const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { PermissionFlagsBits } = require('discord.js'); // Ajuste na importação

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registrar-resultado')
        .setDescription('Registra o resultado de uma batalha entre facções.')
        .addStringOption(option =>
    option.setName('faccao-vencedora')
        .setDescription('Nome da facção vencedora')
        .setRequired(true)
    )
        .addStringOption(option =>
    option.setName('territorio')
        .setDescription('Nome do território disputado')
        .setRequired(true)
    )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Agora funciona corretamente

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
            console.log(`Bot desabilitado ou servidor ${serverId} não registrado no arquivo.`);
            return interaction.reply({
                content: 'O bot está desabilitado neste servidor.',
                ephemeral: true,
            });
        }

        const allowedRoleIds = ['1152754038341906482', '1156067828315725874', '1182960760977117245', '1306228862576758864'];
        const member = interaction.member;
        const hasRole = allowedRoleIds.some(roleId => member.roles.cache.has(roleId));

        if (!hasRole) {
            return interaction.reply({
                content: 'Você não tem permissão para usar este comando.',
                ephemeral: true,
            });
        }

        const factionName = interaction.options.getString('faccao-vencedora');
        const territoryName = interaction.options.getString('territorio');

        const factionsPath = path.join(__dirname, '../data/factions.json');
        const territoriesPath = path.join(__dirname, '../data/territories.json');

        const factionsData = JSON.parse(fs.readFileSync(factionsPath, 'utf-8'));
        const territoriesData = JSON.parse(fs.readFileSync(territoriesPath, 'utf-8'));

        // Verifica se a facção existe
        if (!factionsData[factionName]) {
            return interaction.reply({ content: `Facção "${factionName}" não encontrada.`, ephemeral: true });
        }

        // Verifica se o território existe
        if (!territoriesData[territoryName]) {
            return interaction.reply({ content: `Território "${territoryName}" não encontrado.`, ephemeral: true });
        }

        // Atualiza o controlador do território e salva o arquivo
        territoriesData[territoryName].controller = factionName;
        fs.writeFileSync(territoriesPath, JSON.stringify(territoriesData, null, 2));

        // Atualiza o status de guerra e o território da facção
        factionsData[factionName].territorios.push(territoryName);
        factionsData[factionName].emGuerra = false;
        factionsData[factionName].statusDisputa = "Vitória registrada";
        const rivalFaction = factionsData[factionName].rival[0];
        if (factionsData[rivalFaction]) {
            factionsData[rivalFaction].emGuerra = false;
            factionsData[rivalFaction].statusDisputa = "Derrota registrada";
        }

        fs.writeFileSync(factionsPath, JSON.stringify(factionsData, null, 2));

        // Log do resultado no console
        console.log(`Resultado registrado: A facção "${factionName}" agora controla o território "${territoryName}".`);

        return interaction.reply({ content: `Resultado registrado! A facção **${factionName}** agora controla o território **${territoryName}**.`, ephemeral: false });
    }
};
