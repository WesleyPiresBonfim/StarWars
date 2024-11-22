const { SlashCommandBuilder } = require('@discordjs/builders');
const db = require('../database.js'); // Importa o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Trabalhe para ganhar StarCoins para você e sua facção.'),
    async execute(interaction) {
        try {
            const serverId = interaction.guild.id;
            const userId = interaction.user.id;
            const currentTime = Date.now(); // Timestamp atual em milissegundos
            const cooldownDuration = 15 * 60 * 1000; // 15 minutos em milissegundos

            // Verifica se o bot está habilitado no servidor
            const serverQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverResult = await db.query(serverQuery, [serverId]);

            if (serverResult.rowCount === 0 || !serverResult.rows[0].habilitado) {
                return interaction.reply({
                    content: 'O StarWars está desabilitado neste servidor.',
                    ephemeral: true,
                });
            }

            // Verifica se o usuário possui um perfil
            const userQuery = 'SELECT saldo, cooldown_work FROM users WHERE user_id = $1';
            const userResult = await db.query(userQuery, [userId]);

            if (userResult.rowCount === 0) {
                return interaction.reply({
                    content: 'Você ainda não está registrado! Use o comando /registrar para criar seu perfil.',
                    ephemeral: true,
                });
            }

            const { saldo, cooldown_work } = userResult.rows[0];

            // Verifica se o usuário está em cooldown
            if (currentTime < cooldown_work) {
                const remainingTime = Math.ceil((cooldown_work - currentTime) / 60000);
                return interaction.reply({
                    content: `⏳ Você precisa esperar mais ${remainingTime} minutos para usar este comando novamente.`,
                    ephemeral: false,
                });
            }

            // Verifica se o usuário pertence a uma facção
            const factionQuery = `
                SELECT id, saldo, nome
                FROM factions
                WHERE $1 = ANY (membros) OR leader_id = $1
            `;
            const factionResult = await db.query(factionQuery, [userId]);

            const isInFaction = factionResult.rowCount > 0;
            const faction = isInFaction ? factionResult.rows[0] : null;

            // Calcula a recompensa
            let reward = Math.floor(Math.random() * 100) + 1; // Entre 1 e 100 StarCoins
            let factionShare = 0;

            if (isInFaction) {
                factionShare = Math.floor(reward * 0.05); // 5% para a facção
                reward += Math.floor(reward * 0.10); // 10% extra para o usuário
            } else {
                reward -= Math.floor(reward * 0.15); // 15% a menos para quem não está em uma facção
            }

            // Atualiza o saldo do usuário
            const updateUserQuery = 'UPDATE users SET saldo = saldo + $1, cooldown_work = $2 WHERE user_id = $3';
            await db.query(updateUserQuery, [reward, currentTime + cooldownDuration, userId]);

            // Atualiza o saldo da facção (se aplicável)
            if (isInFaction) {
                const updateFactionQuery = 'UPDATE factions SET saldo = saldo + $1 WHERE id = $2';
                await db.query(updateFactionQuery, [factionShare, faction.id]);
            }

            // Responde ao usuário
            const response = isInFaction
            ? `Você trabalhou e ganhou ${reward} StarCoins!\n5% (${factionShare} StarCoins) foram adicionados à facção **${faction.nome}**.`
            : `Você trabalhou e ganhou ${reward} StarCoins!\n⚠️ Junte-se a uma facção para ganhar 10% a mais de StarCoins (e sua facção recebe 5% também).`;

            await interaction.reply(response);
        } catch (error) {
            console.error('Erro ao executar o comando work:', error);
            await interaction.reply({
                content: 'Ocorreu um erro ao executar este comando.',
                ephemeral: true,
            });
        }
    },
};
