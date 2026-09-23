// Versão do SDK. Bumpada pelo scripts/release-sdks.sh junto com o package.json
// (o test/version.test.ts trava a igualdade entre os dois).
//
// Não é cosmética: vai no header X-Bzapper-Client de toda requisição, e é por
// ele que a API sabe a quem avisar quando uma correção exige atualizar o código.
export const VERSION = '0.8.1';

/** Identificação enviada em X-Bzapper-Client. */
export const CLIENT_ID = `bzapper-node/${VERSION}`;
