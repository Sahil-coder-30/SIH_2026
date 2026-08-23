/**
 * scripts/start_all_services.mjs
 * Starts all PharmaChain microservices locally concurrently in one command.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const services = [
    { name: 'pharma-core',   dir: 'services/pharma-core',   port: 4000, color: '\x1b[36m' }, // Cyan
    { name: 'manufacturer', dir: 'services/manufacturer',  port: 3001, color: '\x1b[32m' }, // Green
    { name: 'shopkeeper',   dir: 'services/shopkeeper',    port: 3002, color: '\x1b[33m' }, // Yellow
    { name: 'consumer',     dir: 'services/consumer',      port: 3003, color: '\x1b[35m' }, // Magenta
    { name: 'admin',        dir: 'services/admin',         port: 3005, color: '\x1b[34m' }, // Blue
];

const RESET = '\x1b[0m';
const processes = [];

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('🚀 Starting All PharmaChain Microservices Concurrently (Single Command)');
console.log('═══════════════════════════════════════════════════════════════════════════════');

services.forEach(svc => {
    const cwd = path.join(rootDir, svc.dir);
    console.log(`${svc.color}[${svc.name}] Launching on port ${svc.port}...${RESET}`);

    const child = spawn('node', ['server.js'], {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', data => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
            if (line.trim()) console.log(`${svc.color}[${svc.name}:${svc.port}]${RESET} ${line}`);
        });
    });

    child.stderr.on('data', data => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
            if (line.trim()) console.error(`${svc.color}[${svc.name}:${svc.port}]${RESET} \x1b[31m${line}\x1b[0m`);
        });
    });

    child.on('exit', code => {
        console.log(`${svc.color}[${svc.name}] Process exited with code ${code}${RESET}`);
    });

    processes.push(child);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down all microservices...');
    processes.forEach(p => p.kill('SIGTERM'));
    process.exit(0);
});

process.on('SIGTERM', () => {
    processes.forEach(p => p.kill('SIGTERM'));
    process.exit(0);
});
