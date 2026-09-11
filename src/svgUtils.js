'use strict';

// O SVG que o Ketcher gera tem o viewBox exatamente do tamanho do desenho,
// sem nenhuma margem — o texto de rótulos como "H3C"/"OH" encosta na borda.
// Apps que reimportam esse SVG (o importador do LibreOffice, por exemplo)
// cortam esse pouquinho que sobra em volta das letras, cortando a lateral
// esquerda/direita da estrutura. Como a margem só expande o viewBox pra
// fora (sem mover nada dentro dele), dá pra corrigir sem precisar entender
// a estrutura interna do SVG.
function addSvgMargin(svgText, margin) {
  const widthMatch = svgText.match(/width="([\d.]+)"/);
  const heightMatch = svgText.match(/height="([\d.]+)"/);
  const viewBoxMatch = svgText.match(/viewBox="([\d.\s-]+)"/);
  if (!widthMatch || !heightMatch || !viewBoxMatch) return svgText;

  const width = parseFloat(widthMatch[1]);
  const height = parseFloat(heightMatch[1]);
  const [vx, vy, vw, vh] = viewBoxMatch[1].trim().split(/\s+/).map(Number);

  // Margem fixa não escala: um valor que sobra numa estrutura pequena corta
  // rótulo em uma maior. Proporcional ao maior lado, com um piso pra
  // estruturas bem pequenas.
  if (margin === undefined) {
    margin = Math.max(25, Math.round(0.08 * Math.max(width, height)));
  }

  return svgText
    .replace(`width="${widthMatch[1]}"`, `width="${width + margin * 2}"`)
    .replace(`height="${heightMatch[1]}"`, `height="${height + margin * 2}"`)
    .replace(
      `viewBox="${viewBoxMatch[1]}"`,
      `viewBox="${vx - margin} ${vy - margin} ${vw + margin * 2} ${vh + margin * 2}"`
    );
}

// Largura padrão (mm) pra estruturas inseridas no LibreOffice — ver
// getPaddedSizeMM.
const DEFAULT_WIDTH_MM = 60;

// Tamanho (mm) pra inserir o EMF no LibreOffice. As unidades do SVG que o
// Ketcher gera não são pixels reais a nenhum DPI fixo (é uma escala interna
// abstrata — tentamos 96dpi antes e deu um resultado ~4x maior que o
// esperado), então não dá pra converter direto pra mm. O que É confiável é
// a proporção largura/altura do SVG, então fixamos uma largura padrão
// razoável pra uma estrutura pequena e calculamos a altura a partir dela
// — evita distorcer, mesmo sem saber a escala real.
function getPaddedSizeMM(svgText, margin) {
  const padded = addSvgMargin(svgText, margin);
  const widthMatch = padded.match(/width="([\d.]+)"/);
  const heightMatch = padded.match(/height="([\d.]+)"/);
  if (!widthMatch || !heightMatch) return null;

  const width = parseFloat(widthMatch[1]);
  const height = parseFloat(heightMatch[1]);
  const widthMM = DEFAULT_WIDTH_MM;
  const heightMM = DEFAULT_WIDTH_MM * (height / width);
  return { widthMM, heightMM };
}

module.exports = { addSvgMargin, getPaddedSizeMM };
