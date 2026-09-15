// Copia o motor (js/calculo.js, fonte única, sem build) para src/engine/calculo.js
// acrescentando o export ES module. Roda antes de `dev` e `build` (predev/prebuild).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const origem = join(aqui, '..', '..', 'js', 'calculo.js');
const destino = join(aqui, '..', 'src', 'engine', 'calculo.js');

const fonte = readFileSync(origem, 'utf8')
  .split(/\r?\n/)
  .filter(l => !/module\.exports = Calculo/.test(l)) // a linha CommonJS não faz sentido num ES module
  .join('\n');
const saida = `/* GERADO por scripts/sync-engine.mjs a partir de ../../js/calculo.js — não edite aqui. */\n${fonte}\nexport default Calculo;\n`;
writeFileSync(destino, saida, 'utf8');
console.log('engine sincronizado:', destino);
