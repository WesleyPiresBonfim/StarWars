const { SlashCommandBuilder } = require('discord.js');
const db = require('../database.js'); // Importa o arquivo de conexão com o banco

// Função para validar o código hexadecimal
function isValidHexColor(color) {
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

// Função para validar URL do emblema
function isValidURL(url) {
    try {
        new URL(url);
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('criarfaccao')
        .setDescription('Cria uma nova facção com um nome, cor e atributos adicionais.')
        .addStringOption(option =>
    option.setName('nome')
        .setDescription('Nome da facção')
        .setRequired(true))
        .addStringOption(option =>
    option.setName('cor')
        .setDescription('Cor da facção (em hexadecimal, por exemplo, #FF0000)')
        .setRequired(true))
        .addStringOption(option =>
    option.setName('descricao')
        .setDescription('Descrição da facção')
        .setRequired(false))
        .addStringOption(option =>
    option.setName('emblema')
        .setDescription('URL do emblema da facção')
        .setRequired(false)),
    async execute(interaction) {
        try {
            const nome = interaction.options.getString('nome');
            const cor = interaction.options.getString('cor');
            const descricao = interaction.options.getString('descricao') || 'Nenhuma descrição fornecida.';
            const emblema = interaction.options.getString('emblema') || null;
            const owner = interaction.user.id;
            const leader = interaction.user.id;
            const tag = '#recrutando'; // Definindo a tag fixa

            // Validação do código hexadecimal de cor
            if (!isValidHexColor(cor)) {
                return interaction.reply({
                    content: 'A cor fornecida não é válida. Utilize um código hexadecimal como #FF0000.',
                    ephemeral: true,
                });
            }

            // Validação da URL do emblema
            if (emblema && !isValidURL(emblema)) {
                return interaction.reply({
                    content: 'A URL do emblema fornecida não é válida. Certifique-se de que é uma URL completa.',
                    ephemeral: true,
                });
            }

            // Verifica se já existe uma facção com o mesmo nome
            const checkNameQuery = 'SELECT id FROM factions WHERE nome = $1';
            const existingFaction = await db.query(checkNameQuery, [nome]);
            if (existingFaction.rowCount > 0) {
                return interaction.reply({
                    content: 'Já existe uma facção com esse nome.',
                    ephemeral: true,
                });
            }

            // Verifica se o usuário já é líder de outra facção
            const checkLeaderQuery = 'SELECT id FROM factions WHERE leader_id = $1';
            const isLeader = await db.query(checkLeaderQuery, [leader]);
            if (isLeader.rowCount > 0) {
                return interaction.reply({
                    content: 'Você já é líder de outra facção e não pode criar uma nova.',
                    ephemeral: true,
                });
            }

            // Insere a nova facção no banco
            const insertQuery = `
                INSERT INTO factions (nome, cor, owner_id, leader_id, descricao, emblema, membros, tag)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            await db.query(insertQuery, [nome, cor, owner, leader, descricao, emblema, '{}', tag]);

            return interaction.reply(`Facção **${nome}** criada com sucesso!`);
        } catch (error) {
            console.error('Erro ao criar facção:', error);
            return interaction.reply({
                content: 'Ocorreu um erro ao tentar criar a facção.',
                ephemeral: true,
            });
        }
    },
};
