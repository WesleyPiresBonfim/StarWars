const { SlashCommandBuilder } = require('@discordjs/builders');
const Tesseract = require('tesseract.js');
const fetch = require('node-fetch');


function extrairDadosJogador(text) {
    console.log(text); // Exibir o texto extraído no console
    let pas = text.match(/PAS\s+(\d+)/);
    console.log('PAS:', pas); // Exibir o resultado da expressão regular
    pas = pas ? parseInt(pas[1]) : 0; // Se não encontrar, retorna 0

    let fin = text.match(/FIN\s+(\d+)/);
    fin = fin ? parseInt(fin[1]) : 0;

    let dri = text.match(/DRI\s+(\d+)/);
    dri = dri ? parseInt(dri[1]) : 0;

    let vel = text.match(/VEL\s+(\d+)/);
    vel = vel ? parseInt(vel[1]) : 0;

    let def = text.match(/DEF\s+(\d+)/);
    def = def ? parseInt(def[1]) : 0;

    let res = text.match(/RES\s+(\d+)/);
    res = res ? parseInt(res[1]) : 0;

    return {
        pas: pas,
        fin: fin,
        dri: dri,
        vel: vel,
        def: def,
        res: res
    };
}

// Função para comparar os jogadores
function compararJogadores(jogador1, jogador2) {
    let output = 'Comparando jogadores:\n\n';
    const atributos = ["pas", "fin", "dri", "vel", "def", "res"];
    atributos.forEach(atributo => {
        const valor1 = jogador1[atributo];
        const valor2 = jogador2[atributo];
        let vantagem = "";
        if (valor1 > valor2) {
            vantagem = `(vantagem para Jogador 1)`;
        } else if (valor2 > valor1) {
            vantagem = `(vantagem para Jogador 2)`;
        }
        output += `${atributo.toUpperCase()}: ${valor1} vs ${valor2} ${vantagem}\n`;
    });
    return output;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('comparar-jogadores')
        .setDescription('Compara dois jogadores.')
        .addStringOption(option =>
    option.setName('jogador1')
        .setDescription('Nome do primeiro jogador')
        .setRequired(true))
        .addStringOption(option =>
    option.setName('jogador2')
        .setDescription('Nome do segundo jogador')
        .setRequired(true)),
async execute(interaction) {
    const jogador1 = interaction.options.getString('jogador1');
    const jogador2 = interaction.options.getString('jogador2');

    await interaction.reply(`Comparando ${jogador1} e ${jogador2}. Aguarde...\n\nUse o comando \`..contratar ${jogador1}\` no canal do DreamTeam.`);

// Obter o canal do DreamTeam (substitua pelo ID do canal correto)
const dreamTeamChannel = interaction.guild.channels.cache.get('1300428798700814407');
if (!dreamTeamChannel) {
    return interaction.followUp('Canal do DreamTeam não encontrado.');
}

try {
    // Capturar a resposta do comando ..contratar jogador1
    const filter1 = m => m.author.id === '1052214694020141178' && m.embeds.length > 0;
    const message1 = await dreamTeamChannel.awaitMessages({ filter: filter1, max: 1, time: 30000, errors: ['time'] });
    const imageUrl1 = message1.first().embeds[0].image.url;

    // Baixar a imagem do jogador1
    const response1 = await fetch(imageUrl1);
    const buffer1 = await response1.buffer();

    // Aplicar OCR na imagem do jogador1
    const { data: { text: text1 } } = await Tesseract.recognize(buffer1);
    const dadosJogador1 = extrairDadosJogador(text1);

    await interaction.followUp(`Agora use o comando \`..contratar ${jogador2}\` no canal do DreamTeam.`);

// Capturar a resposta do comando ..contratar jogador2
const filter2 = m => m.author.id === '1052214694020141178' && m.embeds.length > 0;
const message2 = await dreamTeamChannel.awaitMessages({ filter: filter2, max: 1, time: 30000, errors: ['time'] });
const imageUrl2 = message2.first().embeds[0].image.url;

// Baixar a imagem do jogador2
const response2 = await fetch(imageUrl2);
const buffer2 = await response2.buffer();

// Aplicar OCR na imagem do jogador2
const { data: { text: text2 } } = await Tesseract.recognize(buffer2);
const dadosJogador2 = extrairDadosJogador(text2);

// Comparar os jogadores
const resultado = compararJogadores(dadosJogador1, dadosJogador2);
await interaction.followUp(resultado);
} catch (error) {
console.error('Erro ao comparar jogadores:', error);
await interaction.followUp('Ocorreu um erro ao comparar os jogadores.');
}
},
};