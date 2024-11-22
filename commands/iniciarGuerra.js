const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('iniciar-guerra')
        .setDescription('Inicie uma guerra entre duas facções rivais.')
        .addStringOption(option =>
    option.setName('atacante')
        .setDescription('Facção atacante')
        .setRequired(true))
        .addStringOption(option =>
    option.setName('defensor')
        .setDescription('Facção defensora')
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

        const atacanteNome = interaction.options.getString('atacante');
        const defensorNome = interaction.options.getString('defensor');
        const factionsPath = path.join(__dirname, '../data/factions.json');

        // Carrega os dados das facções
        const factionsData = JSON.parse(fs.readFileSync(factionsPath, 'utf-8'));

        // Verifica se as facções existem
        const atacante = factionsData[atacanteNome];
        const defensor = factionsData[defensorNome];

        if (!atacante || !defensor) {
            return interaction.reply('Uma ou ambas as facções não existem!');
        }

        // Verifica se as facções são rivais
        if (!atacante.rival || !atacante.rival.includes(defensorNome)) {
            return interaction.reply(`As facções "${atacanteNome}" e "${defensorNome}" não são rivais! Não é possível iniciar uma guerra.`);
        }

        // Verifica se as facções já estão em guerra
        if (atacante.emGuerra || defensor.emGuerra) {
            return interaction.reply(`Uma das facções já está em guerra!`);
        }

        // Define o status de guerra para ambas as facções
        factionsData[atacanteNome].emGuerra = true;
        factionsData[defensorNome].emGuerra = true;

        // Define o status de "disputa no DreamTeam"
        factionsData[atacanteNome].statusDisputa = 'Em progresso no DreamTeam';
        factionsData[defensorNome].statusDisputa = 'Em progresso no DreamTeam';

        // Salva as mudanças no arquivo factions.json
        fs.writeFileSync(factionsPath, JSON.stringify(factionsData, null, 2), 'utf-8');

        // Responde com sucesso e informação sobre a batalha no DreamTeam
        return interaction.reply(
            `A guerra entre "${atacanteNome}" e "${defensorNome}" foi iniciada!\n` +
            `A disputa será decidida em uma batalha no DreamTeam. Use um comando de registro para informar o vencedor assim que a batalha terminar.`
        );
    },
};
