const { SlashCommandBuilder } = require('@discordjs/builders');
const Tesseract = require('tesseract.js');
const fetch = require('node-fetch');

// Função para extrair os dados do goleiro
function extrairDadosGoleiro(text) {
    console.log(text); // Exibir o texto extraído no console
    let alc = text.match(/ALC\s+(\d+)/);
    alc = alc ? parseInt(alc[1]) : 0;

    let con = text.match(/CON\s+(\d+)/);
    con = con ? parseInt(con[1]) : 0;

    let rep = text.match(/REP\s+(\d+)/);
    rep = rep ? parseInt(rep[1]) : 0;

    let ref = text.match(/REF\s+(\d+)/);
    ref = ref ? parseInt(ref[1]) : 0;

    let exp = text.match(/EXP\s+(\d+)/);
    exp = exp ? parseInt(exp[1]) : 0;

    let pos = text.match(/POS\s+(\d+)/);
    pos = pos ? parseInt(pos[1]) : 0;

    return {
        alc: alc,
        con: con,
        rep: rep,
        ref: ref,
        exp: exp,
        pos: pos
    };
}

// Função para comparar os goleiros
function compararGoleiros(goleiro1, goleiro2) {
    let output = 'Comparando goleiros:\n\n';
    const atributos = ["alc", "con", "rep", "ref", "exp", "pos"];
    atributos.forEach(atributo => {
        const valor1 = goleiro1[atributo];
        const valor2 = goleiro2[atributo];
        let vantagem = "";
        if (valor1 > valor2) {
            vantagem = `(vantagem para Goleiro 1)`;
        } else if (valor2 > valor1) {
            vantagem = `(vantagem para Goleiro 2)`;
        }
        output += `${atributo.toUpperCase()}: ${valor1} vs ${valor2} ${vantagem}\n`;
    });
    return output;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('comparar-goleiro')
        .setDescription('Compara dois goleiros.')
        .addStringOption(option =>
    option.setName('goleiro1')
        .setDescription('Nome do primeiro goleiro')
        .setRequired(true))
        .addStringOption(option =>
    option.setName('goleiro2')
        .setDescription('Nome do segundo goleiro')
        .setRequired(true)),
async execute(interaction) {
    const goleiro1 = interaction.options.getString('goleiro1');
    const goleiro2 = interaction.options.getString('goleiro2');

    await interaction.reply(`Comparando ${goleiro1} e ${goleiro2}. Aguarde...\n\nUse o comando \`..contratar ${goleiro1}\` no canal do DreamTeam.`);

// Obter o canal do DreamTeam (substitua pelo ID do canal correto)
const dreamTeamChannel = interaction.guild.channels.cache.get('1300428798700814407');
if (!dreamTeamChannel) {
    return interaction.followUp('Canal do DreamTeam não encontrado.');
}

try {
    // Capturar a resposta do comando ..contratar goleiro1
    const filter1 = m => m.author.id === '1052214694020141178' && m.embeds.length > 0;
    const message1 = await dreamTeamChannel.awaitMessages({ filter: filter1, max: 1, time: 30000, errors: ['time'] });
    const imageUrl1 = message1.first().embeds[0].image.url;

    // Baixar a imagem do goleiro1
    const response1 = await fetch(imageUrl1);
    const buffer1 = await response1.buffer();

    // Aplicar OCR na imagem do goleiro1
    const { data: { text: text1 } } = await Tesseract.recognize(buffer1);
    const dadosGoleiro1 = extrairDadosGoleiro(text1);

    await interaction.followUp(`Agora use o comando \`..contratar ${goleiro2}\` no canal do DreamTeam.`);

// Capturar a resposta do comando ..contratar goleiro2
const filter2 = m => m.author.id === '1052214694020141178' && m.embeds.length > 0;
const message2 = await dreamTeamChannel.awaitMessages({ filter: filter2, max: 1, time: 30000, errors: ['time'] });
const imageUrl2 = message2.first().embeds[0].image.url;

// Baixar a imagem do goleiro2
const response2 = await fetch(imageUrl2);
const buffer2 = await response2.buffer();

// Aplicar OCR na imagem do goleiro2
const { data: { text: text2 } } = await Tesseract.recognize(buffer2);
const dadosGoleiro2 = extrairDadosGoleiro(text2);

// Comparar os goleiros
const resultado = compararGoleiros(dadosGoleiro1, dadosGoleiro2);
await interaction.followUp(resultado);
} catch (error) {
console.error('Erro ao comparar goleiros:', error);
await interaction.followUp('Ocorreu um erro ao comparar os goleiros.');
}
},
};
