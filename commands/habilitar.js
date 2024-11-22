const { SlashCommandBuilder } = require('@discordjs/builders');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('habilitar')
        .setDescription('Habilita ou desabilita o bot StarWars no servidor atual.')
        .addBooleanOption(option =>
    option.setName('enabled')
        .setDescription('Use true para habilitar e false para desabilitar o bot StarWars.')
        .setRequired(true)),
    async execute(interaction) {
        try {
            const allowedRoleIds = '1152754038341906482'; // ID do cargo permitido
            const member = interaction.member;

            if (!member.roles.cache.has(allowedRoleIds)) {
                return interaction.reply({
                    content: 'Você não tem permissão para usar este comando.',
                    ephemeral: true,
                });
            }

            const serverId = interaction.guild.id;
            const serverName = interaction.guild.name; // Obtém o nome público do servidor
            const enabled = interaction.options.getBoolean('enabled');

            // Verifica o status atual no banco
            const queryCheck = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const result = await db.query(queryCheck, [serverId]);

            if (result.rowCount > 0) {
                const currentStatus = result.rows[0].habilitado;

                if (currentStatus === enabled) {
                    const alreadySetMessage = enabled
                    ? 'O bot StarWars já está habilitado neste servidor.'
                    : 'O bot StarWars já está desabilitado neste servidor.';

                    return interaction.reply({
                        content: alreadySetMessage,
                        ephemeral: true,
                    });
                }

                // Atualiza o status e o nome no banco
                const queryUpdate = `
                    UPDATE server_status
                    SET habilitado = $1, nome_servidor = $2
                    WHERE servidor_id = $3
                `;
                await db.query(queryUpdate, [enabled, serverName, serverId]);
            } else {
                // Insere o status e o nome no banco caso não exista
                const queryInsert = `
                    INSERT INTO server_status (servidor_id, habilitado, nome_servidor)
                    VALUES ($1, $2, $3)
                `;
                await db.query(queryInsert, [serverId, enabled, serverName]);
            }

            const message = enabled
            ? 'O StarWars foi habilitado com sucesso neste servidor!'
            : 'O StarWars foi desabilitado neste servidor!';

            await interaction.reply({ content: message });
        } catch (error) {
            console.error('Erro ao habilitar/desabilitar o bot:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Ocorreu um erro ao tentar habilitar/desabilitar o bot.',
                    ephemeral: true,
                });
            } else {
                await interaction.followUp({
                    content: 'Ocorreu um erro ao tentar habilitar/desabilitar o bot.',
                    ephemeral: true,
                });
            }
        }
    }
};
