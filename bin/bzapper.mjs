#!/usr/bin/env node
// Executável do pacote: `npx @bzapper/client listen --forward-to http://localhost:3000/webhooks`.
//
// Só um invólucro — a CLI de verdade é o `dist/cli.js` (compilado de src/cli.ts),
// para que o mesmo código seja testado com `node --test`.
import { main } from "../dist/cli.js";

process.exitCode = await main(process.argv.slice(2));
