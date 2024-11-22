const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database.js');
const axios = require('axios'); // Para validar URLs de imagens

// Função para validar cor hexadecimal
function isValidHexColor(color) {
    return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

// Função para verificar se a URL é válida e aponta para uma imagem
async function isValidImageUrl(url) {
    if (!/\.(jpeg|jpg|png|gif)$/i.test(url)) return false; // Verifica a extensão

    try {
        const response = await axios.head(url);
        const contentType = response.headers['content-type'];
        return contentType.startsWith('image/');
    } catch (error) {
        return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('personalizar-faccao')
        .setDescription('Personalize sua facção.')
        .addStringOption(option =>
    option.setName('emblema')
        .setDescription('Nova URL do emblema da facção')
        .setRequired(false))
        .addStringOption(option =>
    option.setName('descricao')
        .setDescription('Descrição da facção (até 255 caracteres)')
        .setRequired(false))
        .addStringOption(option =>
    option.setName('cor')
        .setDescription('Cor da facção em hexadecimal (ex: #FF0000)')
        .setRequired(false)),
    async execute(interaction) {
        try {
            // Verificar se o bot está habilitado no servidor
            const serverId = interaction.guild.id;
            const serverQuery = 'SELECT habilitado FROM server_status WHERE servidor_id = $1';
            const serverStatus = await db.query(serverQuery, [serverId]);

            if (serverStatus.rowCount === 0 || !serverStatus.rows[0].habilitado) {
                return interaction.reply({
                    content: 'O StarWars está desativado neste servidor.',
                    ephemeral: true,
                });
            }

            // Dados do comando
            const emblema = interaction.options.getString('emblema') || null;
            const descricao = interaction.options.getString('descricao');
            const cor = interaction.options.getString('cor');
            const userId = interaction.user.id;

            // Buscar a facção do usuário
            const factionQuery = 'SELECT * FROM factions WHERE leader_id = $1';
            const factionResult = await db.query(factionQuery, [userId]);

            if (factionResult.rowCount === 0) {
                return interaction.reply({
                    content: 'Você não é líder de nenhuma facção e não pode personalizá-la.',
                    ephemeral: true,
                });
            }

            const faction = factionResult.rows[0];

            // Validações
            if (descricao && descricao.length > 255) {
                return interaction.reply({
                    content: 'A descrição deve ter no máximo 255 caracteres.',
                    ephemeral: true,
                });
            }

            if (cor && !isValidHexColor(cor)) {
                return interaction.reply({
                    content: 'A cor deve estar em formato hexadecimal válido, por exemplo, #FF0000.',
                    ephemeral: true,
                });
            }

            if (emblema && !(await isValidImageUrl(emblema))) {
                return interaction.reply({
                    content: 'A URL fornecida não aponta para uma imagem válida (.jpg, .jpeg, .png, .gif).',
                    ephemeral: true,
                });
            }

            // Atualizar facção no banco de dados
            const updateQuery = `
                UPDATE factions
                SET emblema = COALESCE($1, emblema),
                    descricao = COALESCE($2, descricao),
                    cor = COALESCE($3, cor)
                WHERE id = $4
            `;
            await db.query(updateQuery, [emblema, descricao, cor, faction.id]);

            // Embed de confirmação
            const embed = new EmbedBuilder()
                .setColor(cor || faction.cor || '#8B0000')
                .setTitle('🏴 Facção Personalizada')
                .setDescription(`Facção **${faction.nome}** personalizada com sucesso!`)
                .addFields(
                { name: 'Emblema', value: emblema || 'Não alterado', inline: true },
                { name: 'Descrição', value: descricao || 'Não alterada', inline: true },
                { name: 'Cor', value: cor || 'Não alterada', inline: true },
            )
                .setThumbnail(emblema || faction.emblema || 'https://via.placeholder.com/150')
                .setFooter({ text: 'Personalização de Facção', iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao personalizar a facção:', error);
            await interaction.reply({
                content: 'Ocorreu um erro ao tentar personalizar a facção.',
                ephemeral: true,
            });
        }
    },
};
