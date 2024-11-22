const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('atribuir-territorio')
        .setDescription('Atribua um território a uma facção.')
        .addStringOption(option =>
    option.setName('faccao')
        .setDescription('Nome da facção')
        .setRequired(true))
        .addStringOption(option =>
    option.setName('territorio')
        .setDescription('Nome do território')
        .setRequired(true)),
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

        const faccaoNome = interaction.options.getString('faccao');
        const territorioNome = interaction.options.getString('territorio');
        const territoriesPath = path.join(__dirname, '../data/territories.json');
        const factionsPath = path.join(__dirname, '../data/factions.json');

        // Carregar os dados das facções e territórios
        const territoriesData = JSON.parse(fs.readFileSync(territoriesPath, 'utf-8'));
        const factionsData = JSON.parse(fs.readFileSync(factionsPath, 'utf-8'));

        // Verifica se a facção existe
        const faccao = factionsData[faccaoNome];
        if (!faccao) {
            return interaction.reply(`A facção "${faccaoNome}" não existe!`);
        }

        // Verifica se o território já está atribuído
        if (territoriesData[territorioNome] && territoriesData[territorioNome].faccao) {
            return interaction.reply(`O território "${territorioNome}" já está controlado pela facção "${territoriesData[territorioNome].faccao}".`);
        }

        // Atribui o território à facção
        territoriesData[territorioNome] = {
            faccao: faccaoNome,
            cor: faccao.cor || '#FFFFFF',  // Usa a cor da facção
            recursos: {},  // Pode ser expandido depois com recursos específicos
        };

        // Atualiza os dados no arquivo JSON
        fs.writeFileSync(territoriesPath, JSON.stringify(territoriesData, null, 2), 'utf-8');

        // Responde com sucesso
        return interaction.reply(`O território "${territorioNome}" foi atribuído à facção "${faccaoNome}".`);
    },
};
