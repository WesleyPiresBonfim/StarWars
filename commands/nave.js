const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nave')
        .setDescription('Exibe o status da sua nave.'),
    async execute(interaction) {
        const userId = interaction.user.id;

        try {
            // Recuperar dados da nave
            const naveQuery = `
                SELECT *
                FROM naves
                WHERE user_id = $1
            `;
            const naveResult = await db.query(naveQuery, [userId]);

            if (naveResult.rowCount === 0) {
                return interaction.reply({
                    content: '❌ Você ainda não possui uma nave. Construa sua primeira nave para continuar.',
                    ephemeral: true,
                });
            }

            const nave = naveResult.rows[0];

            // Garantir que os valores estejam definidos e convertidos corretamente
            const cascoComBonus = nave.casco_atual || 0;
            const combustivelComBonus = nave.combustivel_atual || 0;
            const escudoAtual = nave.escudo_atual || 0;
            const suporteVitalAtual = nave.suporte_vital_atual || 0;

            // Criar embed com o status da nave
            const embed = new EmbedBuilder()
                .setColor('#00AAFF')
                .setTitle('⚙️ Status da Nave')
                .setDescription('Confira os detalhes da sua nave:')
                .addFields(
                { name: '🚀 Tipo', value: nave.tipo_nave || 'Desconhecido', inline: true },
                { name: '🛠️ Casco', value: `${cascoComBonus} / ${nave.casco_maximo || 0}`, inline: true },
                { name: '⛽ Combustível', value: `${combustivelComBonus} / ${nave.combustivel_maximo || 0}`, inline: true },
                { name: '🛡️ Escudo', value: `${escudoAtual} / ${nave.escudo_maximo || 0}`, inline: true },
                { name: '🌱 Suporte Vital', value: `${suporteVitalAtual} / ${nave.suporte_vital_maximo || 0}`, inline: true },
                { name: '🔧 Estado', value: nave.estado || 'Desconhecido', inline: false }
            )
                .setFooter({ text: 'StarWars - Sistema de Naves' });

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao exibir a nave:', error);
            await interaction.reply({
                content: '❌ Ocorreu um erro ao tentar exibir o status da sua nave.',
                ephemeral: true,
            });
        }
    },
};
