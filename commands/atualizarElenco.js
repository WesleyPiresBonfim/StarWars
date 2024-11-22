const { SlashCommandBuilder } = require('discord.js');
const db = require('../database.js'); // Conexão com o banco de dados

const iconesColecoes = {
    '<:emoji_cdb:1305302076808495104>': 'Copa do Brasil',
    '<:libertadores:1289704910442598541>': 'Glória Eterna',
    '<:AGrandeConquista:1289704703319605320>': 'A Grande Conquista',
    ':halloween:': 'Halloween',
    ':256brasileirao:': 'POTM',
    ':medalha1:': 'Recordes',
    ':256mt:': 'Melhores Transferências',
    ':NovaGeracao:': 'Nova Geração',
    ':copa_america:': 'Copa América',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('atualizar-elenco')
        .setDescription('Atualiza o elenco do DreamTeam vinculado ao seu perfil.'),
async execute(interaction) {
    try {
        const userId = interaction.user.id;
        console.log(`[LOG] Iniciando atualização do elenco para o usuário ${userId}.`);

        const userQuery = 'SELECT * FROM times_vinculados WHERE user_id = $1';
        const userResult = await db.query(userQuery, [userId]);

        if (userResult.rowCount === 0) {
            console.log(`[LOG] Usuário ${userId} não está registrado.`);
            return interaction.reply({
                content: 'Você ainda não está registrado! Use o comando `/registrar` para começar.',
                ephemeral: true,
            });
        }

        const { formacao } = userResult.rows[0];
        console.log(`[LOG] Formação do usuário ${userId}: ${formacao}`);

        const thread = await interaction.channel.threads.create({
            name: `Atualizar elenco de ${interaction.user.username}`,
            autoArchiveDuration: 60,
            type: 11,
        });

        await thread.members.add(interaction.user.id);
        console.log(`[LOG] Thread criada: ${thread.id}`);

        thread.send(
        `Olá, ${interaction.user}! Use o comando \`..elenco\` para enviar a primeira página do seu elenco.\n\n` +
        `- Digite **"atualizar"** para capturar a nova página após trocá-la no DreamTeam.\n` +
        `- Digite **"concluído"** para finalizar.`
        );

        const jogadores = new Map();
        let ultimaMensagem = null;

        const collector = thread.createMessageCollector({
            filter: (m) =>
            (m.author.id === '1052214694020141178' && m.embeds.length > 0) ||
            (m.author.id === userId && ['atualizar', 'concluído'].includes(m.content.toLowerCase())),
            time: 300000,
        });

        collector.on('collect', (message) => {
            const content = message.content.toLowerCase();

            if (content === 'concluído') {
                console.log(`[LOG] Usuário ${userId} finalizou a coleta digitando "concluído".`);
                collector.stop('concluído');
                return;
            }

            if (content === 'atualizar') {
                if (!ultimaMensagem) {
                    thread.send('❌ Nenhuma mensagem do DreamTeam foi detectada ainda. Use o comando `..elenco` antes de "atualizar".');
                    return;
                }

                console.log(`[LOG] Comando "atualizar" recebido. Processando a última mensagem coletada.`);
                const jogadoresPagina = extrairElenco(ultimaMensagem);

                jogadoresPagina.forEach((jogador) => {
                    const chave = `${jogador.nome}-${jogador.over}-${jogador.posicao}`;
                    if (!jogadores.has(chave)) {
                        jogadores.set(chave, jogador);
                        console.log(`[LOG] Jogador coletado: ${jogador.nome}, ${jogador.over}, ${jogador.posicao}`);
                    }
                });

                thread.send(`✅ Capturados ${jogadoresPagina.length} jogadores da nova página. Digite **"atualizar"** após trocar para outra página ou **"concluído"** para finalizar.`);
                return;
            }

            if (message.author.id === '1052214694020141178') {
                ultimaMensagem = message;
                console.log('[LOG] Nova mensagem do DreamTeam capturada.');
                const jogadoresPagina = extrairElenco(message);

                jogadoresPagina.forEach((jogador) => {
                    const chave = `${jogador.nome}-${jogador.over}-${jogador.posicao}`;
                    if (!jogadores.has(chave)) {
                        jogadores.set(chave, jogador);
                        console.log(`[LOG] Jogador coletado: ${jogador.nome}, ${jogador.over}, ${jogador.posicao}`);
                    }
                });

                thread.send(`✅ Capturados ${jogadoresPagina.length} jogadores desta página. Digite **"atualizar"** após trocar de página ou **"concluído"** para finalizar.`);
            }
        });

        collector.on('end', async (_, reason) => {
            console.log(`[LOG] Coletor encerrado. Motivo: ${reason}.`);
            if (reason === 'time') {
                thread.send('❌ Tempo esgotado para atualizar o elenco. A thread será encerrada em 10 segundos.');
                setTimeout(() => thread.delete(), 10000);
                return;
            }

            if (jogadores.size === 0) {
                console.log('[LOG] Nenhum jogador foi coletado.');
                thread.send('❌ Nenhum jogador foi capturado. Certifique-se de enviar o comando `..elenco` corretamente.\nA thread será encerrada em 10 segundos.');
                setTimeout(() => thread.delete(), 10000);
                return;
            }

            console.log(`[LOG] Total de jogadores coletados: ${jogadores.size}`);
            try {
                const insertJogadorQuery = `
                        INSERT INTO jogadores (nome, over, posicao, colecao, imagem)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (nome, over, posicao) DO NOTHING
                        RETURNING id
                    `;

                const deleteTitularesQuery = `DELETE FROM titulares WHERE user_id = $1`;
                console.log(`[LOG] Removendo titulares antigos para o user_id ${userId}.`);
                await db.query(deleteTitularesQuery, [userId]);

                const titulares = mapearTitulares(Array.from(jogadores.values()), formacao);
                const insertTitularQuery = `
                        INSERT INTO titulares (user_id, jogador_id)
                        VALUES ($1, $2)
                        ON CONFLICT (user_id, jogador_id) DO NOTHING
                    `;

                for (const titular of titulares) {
                    console.log(`[LOG] Inserindo/atualizando titular: ${titular.nome}`);
                    const jogadorResult = await db.query(insertJogadorQuery, [
                        titular.nome,
                        titular.over,
                        titular.posicao,
                        titular.colecao || 'Cartas Base',
                        titular.imagem,
                    ]);

                    const jogadorId = jogadorResult.rows[0]?.id || (
                    await db.query(`SELECT id FROM jogadores WHERE nome = $1 AND over = $2 AND posicao = $3`, [
                        titular.nome,
                        titular.over,
                        titular.posicao,
                    ])
                    ).rows[0]?.id;

                    if (jogadorId) {
                        console.log(`[LOG] Associando jogador_id ${jogadorId} ao user_id ${userId}.`);
                        await db.query(insertTitularQuery, [userId, jogadorId]);
                    }
                }

                thread.send(`✅ Elenco atualizado com sucesso! Jogadores processados: ${jogadores.size}. Titulares vinculados: ${titulares.length}.\nA thread será encerrada em 10 segundos.`);
            } catch (error) {
                console.error('[LOG] Erro ao atualizar elenco:', error);
                thread.send('❌ Ocorreu um erro ao atualizar seu elenco. Tente novamente mais tarde.\nA thread será encerrada em 10 segundos.');
            } finally {
                setTimeout(() => {
                    console.log(`[LOG] Finalizando thread ${thread.id}.`);
                    thread.delete();
                }, 10000);
            }
        });
    } catch (error) {
        console.error('[LOG] Erro ao executar o comando /atualizar-elenco:', error);
        interaction.reply({
            content: '❌ Ocorreu um erro ao executar o comando. Por favor, tente novamente mais tarde.',
            ephemeral: true,
        });
    }
},
};

function extrairElenco(message) {
const embed = message.embeds[0];

if (!embed.fields || embed.fields.length === 0) {
console.log('[LOG] Campos da embed estão vazios ou ausentes.');
return [];
}

const jogadores = [];
const jogadoresUnicos = new Set();

embed.fields.forEach((field) => {
try {
const nomeMatch = field.name.match(/^(.*?)(?: (<:.*?:\d+>|:[a-zA-Z0-9_]+:))?$/);
const nome = nomeMatch[1].trim();
const icone = nomeMatch[2]?.trim();

let colecao = 'Cartas Base';
if (icone) {
for (const [chave, valor] of Object.entries(iconesColecoes)) {
if (icone.includes(chave.replace(/<|>/g, ''))) {
colecao = valor;
break;
}
}
}

const valorPosicaoMatch = field.value.match(/^(\d+)\s\|\s(.*?)$/);
const over = parseInt(valorPosicaoMatch[1], 10);
const posicao = valorPosicaoMatch[2].trim();

const chave = `${nome}-${over}-${posicao}`;
if (!jogadoresUnicos.has(chave)) {
jogadoresUnicos.add(chave);
jogadores.push({ nome, over, posicao, colecao, imagem: null });
console.log(`[LOG] Jogador extraído: ${nome}, ${over}, ${posicao}, ${colecao}`);
}
} catch (error) {
console.error('[LOG] Erro ao processar um campo da embed:', error);
}
});

return jogadores;
}

function mapearTitulares(jogadores, formacao) {
const formacoes = {
'3-3-4': { goleiro: 1, zagueiro: 3, meia_central: 2, meia_ofensivo: 1, ponta_direita: 1, ponta_esquerda: 1, centro_avante: 2 },
'3-5-2': { goleiro: 1, zagueiro: 3, meia_central: 2, meia_ofensivo: 3, centro_avante: 2 },
};

const posicoesNecessarias = formacoes[formacao];
const titulares = [];
const usados = new Set();

console.log(`[LOG] Processando titulares para a formação ${formacao}...`);

Object.entries(posicoesNecessarias).forEach(([posicao, quantidade]) => {
const jogadoresPosicao = jogadores.filter((j) =>
j.posicao.toLowerCase().includes(posicao.replace('_', ' '))
);

jogadoresPosicao
    .sort((a, b) => b.over - a.over) // Priorizar maior OVR
    .slice(0, quantidade) // Selecionar apenas a quantidade necessária
    .forEach((jogador) => {
const chave = `${jogador.nome}-${jogador.over}-${jogador.posicao}`;
if (!usados.has(chave)) {
usados.add(chave);
titulares.push(jogador);
console.log(`[LOG] Titular adicionado: ${jogador.nome}, ${jogador.over}, ${jogador.posicao}`);
}
});
});

console.log(`[LOG] Total de titulares selecionados: ${titulares.length}`);
return titulares;
}
