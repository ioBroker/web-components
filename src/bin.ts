#!/usr/bin/env node
/** The program `iob-web-components`, see `cli.ts` */
import { main } from './cli.js';

process.exitCode = await main(process.argv.slice(2));
