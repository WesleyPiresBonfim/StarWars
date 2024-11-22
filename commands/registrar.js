const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../database.js'); // Conexão com o banco de dados

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registrar')
        .setDescription('Registra o usuário no StarWars e vincula seu time do DreamTeam.'),
        async execute(interaction) {
            try {
                const userId = interaction.user.id;
                console.log(`[LOG] Iniciando registro para o usuário ${userId}`);

                // Verifica se o usuário já está registrado
                const checkUserQuery = 'SELECT * FROM users WHERE user_id = $1';
                const userResult = await db.query(checkUserQuery, [userId]);

                if (userResult.rowCount > 0) {
                    console.log(`[LOG] Usuário ${userId} já registrado.`);
                    return interaction.reply({
                        content: 'Você já está registrado! Use os comandos disponíveis para explorar suas opções.',
                        ephemeral: true,
                    });
                }

                // Criar uma thread privada para vincular o time
                const thread = await interaction.channel.threads.create({
                    name: `Registro de ${interaction.user.username}`,
                    autoArchiveDuration: 60,
                    type: 11, // GUILD_PRIVATE_THREAD
                });

                await thread.members.add(interaction.user.id);
                console.log(`[LOG] Thread criada para o usuário ${userId}: ${thread.id}`);

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('Registro no StarWars')
                    .setDescription(
                    `**Bem-vindo ao StarWars!**\nPara concluir o registro, siga estas etapas:\n\n` +
                    `1️⃣ Digite o **nome exato do seu time** no formato [SIGLA] Nome do Time.\n` +
                    `Exemplo: [STR] DreamStars.\n\n` +
                    `2️⃣ Envie o comando ..time <@${interaction.user.id}> aqui nesta thread.\n` +
                    `O StarWars verificará se o time corresponde ao seu perfil no DreamTeam.\n\n` +
                    `⚠️ **Importante**: O nome do time precisa ser exatamente o mesmo que aparece no DreamTeam.`
                )
                    .setFooter({ text: 'Aguardando registro...' });

                await thread.send({ content: `<@${userId}>`, embeds: [embed] });
                console.log(`[LOG] Instruções enviadas para a thread ${thread.id}`);

                // Coletor para o nome do time
                const nameCollector = thread.createMessageCollector({
                    filter: (message) => message.author.id === userId,
                    max: 1,
                    time: 300000, // 5 minutos
                });

                nameCollector.on('collect', async (message) => {
                    const timeNome = message.content.trim();
                    const timeRegex = /^\[[A-Z]{3}\]\s.+$/; // Exemplo: [STR] DreamStars

                    if (!timeRegex.test(timeNome)) {
                        console.log(`[LOG] Nome do time fora do formato esperado: ${timeNome}`);
                        return thread.send('❌ O nome do time deve estar no formato `[SIGLA] Nome do Time`. Tente novamente.');
                    }

                    console.log(`[LOG] Nome do time recebido: ${timeNome}`);
                    nameCollector.stop(); // Finaliza o coletor do nome

                    await thread.send({
                        content: `⏳ Aguardando comando ..time <@${userId}> nesta thread...`,
                    });

                    // Coletor para a mensagem do DreamTeam
                    const dreamTeamCollector = thread.createMessageCollector({
                        filter: (m) => {
                            const isDreamTeam = m.author.id === '1052214694020141178'; // ID do bot DreamTeam
                            const hasEmbed = m.embeds.length > 0;
                            console.log(`[LOG] Verificando mensagem do DreamTeam: autor=${m.author.id}, embed=${hasEmbed}`);
                            return isDreamTeam && hasEmbed;
                        },
                        max: 1,
                        time: 60000, // 1 minuto para coletar a mensagem do DreamTeam
                    });

                    dreamTeamCollector.on('collect', async (dreamTeamMessage) => {
                        console.log(`[LOG] Resposta do DreamTeam recebida: ${dreamTeamMessage.embeds[0]?.title}`);
                        const dadosTime = extrairDadosTime(dreamTeamMessage);

                        if (dadosTime.nome.toLowerCase() !== timeNome.toLowerCase()) {
                            console.log(`[LOG] Nome do time não corresponde: ${dadosTime.nome} !== ${timeNome}`);
                            return thread.send('❌ O nome do time no DreamTeam não corresponde ao informado. Tente novamente.');
                        }

                        console.log(`[LOG] Nome do time validado com sucesso: ${dadosTime.nome}`);
                        console.log('[LOG] Dados extraídos:', dadosTime);

                        if (!dadosTime.formacao) {
                            await thread.send('❌ Não foi possível capturar a formação do time. Verifique se o comando foi usado corretamente.');
                            return;
                        }

                        try {
                            // Criar registro do usuário
                            const insertUserQuery = `
                                    INSERT INTO users (user_id, saldo, inventario, cooldowns, estatisticas_guerra)
                                    VALUES ($1, $2, $3, $4, $5)
                                `;
                            await db.query(insertUserQuery, [
                                userId,
                                0, // Saldo inicial
                                JSON.stringify([]), // Inventário vazio
                                JSON.stringify({ work: 0, collect: 0 }), // Cooldowns
                                JSON.stringify({ batalhas_vencidas: 0, batalhas_perdidas: 0 }), // Estatísticas de Guerra
                            ]);

                            console.log(`[LOG] Usuário ${userId} registrado com sucesso na tabela 'users'.`);

                            // Inserir o time na tabela times_vinculados
                            const insertTimeQuery = `
    INSERT INTO times_vinculados (
        user_id,
        time_nome,
        valor,
        habilidade,
        estadio,
        formacao,
        capitao,
        faltas,
        passe,
        drible,
        desarme,
        finalizacao,
        velocidade,
        resistencia
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
`;
                            await db.query(insertTimeQuery, [
                                userId,
                                dadosTime.nome,
                                dadosTime.valor || 0,
                                dadosTime.habilidade || 0,
                                dadosTime.estadio || 'Desconhecido',
                                dadosTime.formacao || 'Desconhecida',
                                dadosTime.capitao || 'Desconhecido',
                                dadosTime.faltas || 'Desconhecido',
                                dadosTime.passe || 0,
                                dadosTime.drible || 0,
                                dadosTime.desarme || 0,
                                dadosTime.finalizacao || 0,
                                dadosTime.velocidade || 0,
                                dadosTime.resistencia || 0,
                            ]);


                            console.log(`[LOG] Time registrado no banco de dados para o usuário ${userId}`);

                            // Criar a nave para o usuário com os atributos zerados e o estado "Em Reparo"
                            const insertNaveQuery = `
                                    INSERT INTO naves (user_id, casco_atual, casco_maximo, combustivel_atual, combustivel_maximo, escudo_atual, escudo_maximo, suporte_vital_atual, suporte_vital_maximo, tipo_nave, estado)
                                    VALUES ($1, 0, 100, 0, 100, 0, 50, 0, 50, 'Inicial', 'Em Reparo')
                                `;
                            await db.query(insertNaveQuery, [userId]);

                            console.log(`[LOG] Nave criada para o usuário ${userId}.`);

                            // Mensagem de confirmação na thread
                            await thread.send(
                                `✅ Registro concluído com sucesso! Bem-vindo ao StarWars, ${interaction.user.username}.\n` +
                                `Esta thread será fechada automaticamente em 10 segundos.`
                            );

                            console.log(`[LOG] Mensagem de confirmação enviada na thread ${thread.id}.`);

                            // Mensagem no chat principal
                            await interaction.channel.send(
                                `<@${userId}> Parabéns, seu registro foi concluído com sucesso! Bem-vindo ao StarWars.`
                            );

                            console.log(`[LOG] Mensagem de confirmação enviada no canal principal.`);

                            // Apagar a thread após 10 segundos
                            setTimeout(async () => {
                                await thread.delete();
                                console.log(`[LOG] Thread ${thread.id} deletada após confirmação.`);
                            }, 10000);

                        } catch (error) {
                            console.error('Erro ao registrar usuário ou time:', error);
                            await thread.send('❌ Ocorreu um erro ao tentar registrar. A thread será excluída.');
                            await thread.delete();
                            await interaction.channel.send(
                            `<@${interaction.user.id}> Ocorreu um erro ao tentar registrar. Use \`/registrar\` novamente no canal principal.`
                            );
                        }

                    });

                    dreamTeamCollector.on('end', async (_, reason) => {
                        if (reason === 'time') {
                            console.log(`[LOG] Tempo esgotado para resposta do DreamTeam na thread ${thread.id}`);
                            await thread.send('❌ Tempo esgotado para usar o comando `..time @usuário` no DreamTeam.');
                            await thread.delete();
                            await interaction.channel.send(
                            `<@${interaction.user.id}> Ocorreu um erro ao tentar registrar. Use \`/registrar\` novamente no canal principal.`
                            );
                        }
                    });
                });

            nameCollector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    console.log(`[LOG] Tempo esgotado para o registro na thread ${thread.id}`);
                    await thread.send('❌ Tempo esgotado para registrar. A thread será excluída.');
                    await thread.delete();
                    await interaction.channel.send(
                    `<@${interaction.user.id}> O tempo para concluir o registro expirou. Use \`/registrar\` novamente no canal principal.`
                    );
                }
            });
                } catch (error) {
                console.error('Erro ao registrar usuário:', error);
                return interaction.reply({
                content: '❌ Ocorreu um erro ao tentar registrar. Por favor, tente novamente mais tarde.',
                ephemeral: true,
                });
                }
        },
};

// Função para extrair dados do time do DreamTeam
function extrairDadosTime(message) {
const embed = message.embeds[0];
const dados = {
nome: embed.title || 'Desconhecido', // Nome do time
valor: 0, // Valor do time
habilidade: 0, // Habilidade total
estadio: 'Desconhecido', // Nome do estádio
passe: 0,
drible: 0,
desarme: 0,
finalizacao: 0,
velocidade: 0,
resistencia: 0,
formacao: 'Desconhecida', // Formação do time
capitao: 'Desconhecido', // Capitão do time
faltas: 'Desconhecido', // Batedor de faltas
};

const content = embed.description || '';
const lines = content.split('\n');

lines.forEach((line) => {
if (line.startsWith('<:00moedadt:')) {
const valor = line.match(/\*\*(.*?)\*\*/)?.[1];
dados.valor = valor ? parseFloat(valor.replace('B', '')) : 0;
} else if (line.startsWith('<:00chutedt:')) {
const habilidade = line.match(/\*\*(.*?)\*\*/)?.[1];
dados.habilidade = habilidade ? parseInt(habilidade, 10) : 0;
} else if (line.includes('Estádio')) { // Verifica se a linha contém "Estádio:"
let estadioRaw = line.split('Estádio:')[1]?.trim() || 'Desconhecido';
dados.estadio = estadioRaw.replace(/[_*]/g, '').trim();
}
});

const fields = embed.fields;

fields.forEach((field) => {
const name = field.name.trim().toLowerCase();
const value = field.value.trim().replace(/`/g, '').replace(/```/g, '').trim(); // Remove formatações de código

if (name.includes('passe')) dados.passe = parseInt(value, 10) || 0;
else if (name.includes('drible')) dados.drible = parseInt(value, 10) || 0;
else if (name.includes('desarme')) dados.desarme = parseInt(value, 10) || 0;
else if (name.includes('finalização')) dados.finalizacao = parseInt(value, 10) || 0;
else if (name.includes('velocidade')) dados.velocidade = parseInt(value, 10) || 0;
else if (name.includes('resistência')) dados.resistencia = parseInt(value, 10) || 0;
else if (name.includes('formação')) dados.formacao = value || 'Desconhecida';
else if (name.includes('capitão')) dados.capitao = value || 'Desconhecido';
else if (name.includes('faltas')) dados.faltas = value || 'Desconhecido';
});

return dados;
}
