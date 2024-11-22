const { SlashCommandBuilder } = require('discord.js');
const pool = require('../database'); // Caminho relativo para o arquivo database.js

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testedb')
        .setDescription('Teste a conexão com o banco de dados'),
    async execute(interaction) {
        try {
            const result = await pool.query('SELECT NOW()'); // Consulta simples
            await interaction.reply(`Conexão bem-sucedida! Hora do servidor: ${result.rows[0].now}`);
        } catch (error) {
            console.error('Erro ao consultar o banco de dados:', error);
            await interaction.reply('Houve um erro ao consultar o banco de dados.');
        }
    },
};
