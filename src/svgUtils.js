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

module.exports = { addSvgMargin };
