const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('comparar-times')
        .setDescription('Compara dois times do DreamTeam.')
        .addUserOption(option =>
    option.setName('time1')
        .setDescription('Primeiro time')
        .setRequired(true))
        .addUserOption(option =>
    option.setName('time2')
        .setDescription('Segundo time')
        .setRequired(true)),
async execute(interaction) {

    const statusFilePath = './data/status-servidores.json';

    function loadServerStatus() {
        if (!fs.existsSync(statusFilePath)) {
            return {};
        }
        return JSON.parse(fs.readFileSync(statusFilePath, 'utf8'));
    }

    const status = loadServerStatus();
    const serverId = interaction.guild.id;

    const serverStatus = status[serverId];
    if (!serverStatus || !serverStatus.habilitado) {
        console.log(`Bot desabilitado ou servidor ${serverId} não registrado no arquivo.`);
        return interaction.reply({
            content: 'O bot está desabilitado neste servidor.',
            ephemeral: true,
        });
    }

    const allowedRoleIds = ['1152754038341906482', '1156067828315725874', '1182960760977117245', '1306228862576758864'];
    const member = interaction.member;
    const hasRole = allowedRoleIds.some(roleId => member.roles.cache.has(roleId));

    if (!hasRole) {
        return interaction.reply({
            content: 'Você não tem permissão para usar este comando.',
            ephemeral: true,
        });
    }

    const time1 = interaction.options.getUser('time1');
    const time2 = interaction.options.getUser('time2');
    const dreamTeamChannel = interaction.guild.channels.cache.get('1300428798700814407');

    await interaction.reply(`Aguarde um momento e use o comando \`..time @usuário\` para o primeiro time: ${time1.username}`);

    const filter = m => m.embeds.length > 0 && m.author.id === '1052214694020141178';

    const collector1 = dreamTeamChannel.createMessageCollector({ filter, max: 1, time: 30000 });

    collector1.on('collect', async (message1) => {
        const dadosTime1 = extrairDadosTime(message1);

        await interaction.followUp(`Agora, use o comando \`..time @usuário\` para o segundo time: ${time2.username}`);

        const collector2 = dreamTeamChannel.createMessageCollector({ filter, max: 1, time: 30000 });

        collector2.on('collect', async (message2) => {
            const dadosTime2 = extrairDadosTime(message2);

            const valorConvertido1 = converterParaMilhoes(dadosTime1.valor);
            const valorConvertido2 = converterParaMilhoes(dadosTime2.valor);

            const embed = {
                color: 0x0099ff,
                title: `Comparando ${dadosTime1.nome} e ${dadosTime2.nome}:`,
                fields: [],
            };

            const atributos = ["valor", "habilidade", "passe", "drible", "desarme", "finalizacao", "velocidade", "resistência"];
            atributos.forEach(atributo => {
                let valor1 = dadosTime1[atributo];
                let valor2 = dadosTime2[atributo];
                let vantagem = "";

                if (atributo === "valor") {
                    if (valorConvertido1 > valorConvertido2) {
                        vantagem = `(vantagem para <@${time1.id}>)`;
                    } else if (valorConvertido2 > valorConvertido1) {
                        vantagem = `(vantagem para <@${time2.id}>)`;
                    }
                    valor1 = `\`${dadosTime1.valor}\``;
                valor2 = `\`${dadosTime2.valor}\``;
        } else if (valor1 > valor2) {
        vantagem = `(vantagem para <@${time1.id}>)`;
    } else if (valor2 > valor1) {
        vantagem = `(vantagem para <@${time2.id}>)`;
    }

    embed.fields.push({
        name: atributo.toUpperCase(),
        value: `${valor1} vs ${valor2} ${vantagem}`,
    });
});

await interaction.followUp({
embeds: [embed],
});
});

collector2.on('end', collected => {
if (collected.size === 0) {
interaction.followUp('Tempo esgotado para o segundo time. Tente novamente.');
}
});
});

collector1.on('end', collected => {
if (collected.size === 0) {
interaction.followUp('Tempo esgotado para o primeiro time. Tente novamente.');
}
});
},
};

function extrairDadosTime(message) {
if (!message.embeds || message.embeds.length === 0) {
throw new Error('Nenhuma embed ou campos encontrados na mensagem do DreamTeam.');
}

const embed = message.embeds[0];
const dados = {
nome: embed.title || 'Desconhecido',
valor: null,
habilidade: null,
passe: null,
drible: null,
desarme: null,
finalizacao: null,
velocidade: null,
'resistência': null,
formacao: null,
capitao: null,
faltas: null,
};

const content = embed.description || '';
const lines = content.split('\n');

lines.forEach(line => {
line = line.trim();

if (line.startsWith('<:00moedadt:')) {
dados.valor = line.match(/\*\*(.*?)\*\*/)[1];
} else if (line.startsWith('<:00chutedt:')) {
dados.habilidade = line.match(/\*\*(.*?)\*\*/)[1];
}
});

const fields = embed.fields;

fields.forEach(field => {
const name = field.name.trim().toLowerCase();
const value = field.value.trim();

if (name.includes('passe')) dados.passe = value;
else if (name.includes('drible')) dados.drible = value;
else if (name.includes('desarme')) dados.desarme = value;
else if (name.includes('finalizaçã')) dados.finalizacao = value;
else if (name.includes('velocidade')) dados.velocidade = value;
else if (name.includes('resistência')) dados['resistência'] = value;
else if (name.includes('formação')) dados.formacao = value;
else if (name.includes('capitão')) dados.capitao = value;
else if (name.includes('faltas')) dados.faltas = value;
});

return dados;
}

function converterParaMilhoes(valor) {
if (typeof valor === 'string') {
if (valor.endsWith('B')) {
return parseFloat(valor) * 1000;
} else if (valor.endsWith('M')) {
return parseFloat(valor);
}
}
return parseFloat(valor) || 0;
}
