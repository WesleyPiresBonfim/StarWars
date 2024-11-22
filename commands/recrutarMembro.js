const { SlashCommandBuilder } = require('@discordjs/builders');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('recrutar')
        .setDescription('Recrute alguém para sua facção.')
        .addUserOption(option =>
    option.setName('membro')
        .setDescription('Usuário a ser recrutado')
        .setRequired(true)),
    async execute(interaction) {
        try {
            // Verificar se o bot está habilitado no servidor
            const serverId = interaction.guild.id;
            const serverQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverStatus = await db.query(serverQuery, [serverId]);

            if (serverStatus.rowCount === 0 || !serverStatus.rows[0].habilitado) {
                return interaction.reply({
                    content: 'O bot StarWars está desativado neste servidor.',
                    ephemeral: true,
                });
            }

            const newMember = interaction.options.getUser('membro');
            const leaderId = interaction.user.id;

            // Identificar a facção do líder
            const factionQuery = 'SELECT * FROM factions WHERE leader_id = $1';
            const factionResult = await db.query(factionQuery, [leaderId]);

            if (factionResult.rowCount === 0) {
                return interaction.reply({
                    content: 'Apenas o líder de uma facção pode recrutar membros.',
                    ephemeral: false,
                });
            }

            const faction = factionResult.rows[0];

            // Verificar se o membro já pertence a outra facção
            const checkMemberQuery = `
                SELECT * FROM factions WHERE $1 = ANY(membros) OR leader_id = $1
            `;
            const memberCheck = await db.query(checkMemberQuery, [newMember.id]);

            if (memberCheck.rowCount > 0) {
                return interaction.reply({
                    content: `O membro <@${newMember.id}> já está em outra facção como líder ou membro!`,
                    ephemeral: false,
                });
            }

            // Verificar limite de membros na facção
            const limiteMembros = 5; // Ajuste conforme necessário
            if (faction.membros.length >= limiteMembros) {
                return interaction.reply({
                    content: `A facção "${faction.nome}" já atingiu o limite de ${limiteMembros} membros!`,
                    ephemeral: false,
                });
            }

            // Adicionar membro à facção
            const updatedMembros = [...faction.membros, newMember.id];
            let updateQuery = 'UPDATE factions SET membros = $1 WHERE id = $2';
            const updateParams = [updatedMembros, faction.id];

            // Remover a tag #recrutando se atingir o limite
            if (updatedMembros.length >= limiteMembros && faction.tag === '#recrutando') {
                updateQuery = 'UPDATE factions SET membros = $1, tag = NULL WHERE id = $2';
            }

            await db.query(updateQuery, updateParams);

            return interaction.reply({
                content: `Membro <@${newMember.id}> adicionado à facção "${faction.nome}" com sucesso!`,
            });
        } catch (error) {
            console.error('Erro ao recrutar membro:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao tentar recrutar o membro.',
                ephemeral: true,
            });
        }
    },
};
