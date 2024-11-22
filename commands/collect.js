const { SlashCommandBuilder } = require('@discordjs/builders');
const db = require('../database.js');
const COOLDOWN_HOURS = 8; // Cooldown em horas

// Probabilidades de ganhar cada tipo de constelação
const CAIXAS_PROBABILIDADES = [
    { tipo: 'silver', chance: 50 },
    { tipo: 'gold', chance: 30 },
    { tipo: 'diamond', chance: 15 },
    { tipo: 'dream', chance: 4 },
    { tipo: 'star', chance: 1 },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('collect')
        .setDescription('Colete uma recompensa e descubra uma nova constelação.'),
    async execute(interaction) {
        try {
            const serverId = interaction.guild.id;
            const userId = interaction.user.id;

            console.log(`[LOG] Comando /collect executado por ${userId}`);

            // Verifica se o bot está habilitado no servidor
            const serverQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverStatus = await db.query(serverQuery, [serverId]);
            if (serverStatus.rowCount === 0 || !serverStatus.rows[0].habilitado) {
                return interaction.reply({
                    content: 'O StarWars está desabilitado neste servidor.',
                    ephemeral: true,
                });
            }

            // Busca o perfil do usuário
            const userQuery = 'SELECT saldo, cooldowns, escolha_inicial FROM users WHERE user_id = $1';
            const userResult = await db.query(userQuery, [userId]);

            if (userResult.rowCount === 0) {
                return interaction.reply({
                    content: 'Perfil não encontrado! Use o comando `/registrar` para criar seu perfil.',
                    ephemeral: true,
                });
            }

            const user = userResult.rows[0];
            const now = Date.now();
            const cooldownTime = COOLDOWN_HOURS * 60 * 60 * 1000;
            const lastCollectTime = user.cooldowns?.collect || 0;
            const timeSinceLastCollect = now - lastCollectTime;

            // Ajustar cooldown com base na escolha inicial
            let adjustedCooldown = cooldownTime;
            if (user.escolha_inicial === 'cooldown_reduzido') {
                adjustedCooldown *= 0.75; // Reduz o cooldown em 25%
            }

            // Verifica se o cooldown já expirou
            if (timeSinceLastCollect < adjustedCooldown) {
                const timeLeft = adjustedCooldown - timeSinceLastCollect;
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                return interaction.reply({
                    content: `⏳ Você precisa esperar mais **${hours} horas e ${minutes} minutos** antes de usar o comando /collect novamente.`,
                    ephemeral: false,
                });
            }

            // Determina a caixa recebida com base nas probabilidades
            const randomChance = Math.random() * 100;
            let caixaGanhada = null;

            let acumuladorChance = 0;
            for (const caixa of CAIXAS_PROBABILIDADES) {
                acumuladorChance += caixa.chance;
                if (randomChance <= acumuladorChance) {
                    caixaGanhada = caixa.tipo;
                    break;
                }
            }

            if (!caixaGanhada) {
                return interaction.reply({
                    content: 'Ocorreu um erro ao calcular sua recompensa. Por favor, tente novamente mais tarde.',
                    ephemeral: true,
                });
            }

            // Atualizar a tabela de caixas
            const updateCaixaQuery = `
                INSERT INTO caixas (user_id, ${caixaGanhada})
                VALUES ($1, 1)
                ON CONFLICT (user_id)
                DO UPDATE SET ${caixaGanhada} = caixas.${caixaGanhada} + 1
            `;
            await db.query(updateCaixaQuery, [userId]);

            // Atualizar o cooldown do usuário
            const updateCooldownQuery = `
                UPDATE users
                SET cooldowns = jsonb_set(cooldowns, '{collect}', to_jsonb($1::BIGINT))
                WHERE user_id = $2
            `;
            await db.query(updateCooldownQuery, [now, userId]);

            // Responde ao usuário
            return interaction.reply({
                content: `✅ Você coletou sua recompensa e recebeu uma nova **Constelação ${caixaGanhada.charAt(0).toUpperCase() + caixaGanhada.slice(1)}**!`,
                ephemeral: false,
            });
        } catch (error) {
            console.error('Erro ao executar o comando /collect:', error);
            return interaction.reply({
                content: '❌ Ocorreu um erro ao tentar coletar sua recompensa. Por favor, tente novamente mais tarde.',
                ephemeral: true,
            });
        }
    },
};
