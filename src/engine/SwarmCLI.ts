export const SWARM_CLI_SCRIPT = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const command = process.argv[2];
const fileArg = process.argv[3];
const agentId = process.argv[4];

if (!command || !['lock', 'unlock', 'status'].includes(command)) {
    console.log('Usage: node swarm.js <lock|unlock|status> <filepath> <agentId>');
    process.exit(1);
}

const locksPath = path.join(__dirname, 'swarm_locks.json');

function readLocks() {
    if (!fs.existsSync(locksPath)) return [];
    try {
        return JSON.parse(fs.readFileSync(locksPath, 'utf8'));
    } catch {
        return [];
    }
}

function writeLocks(locks) {
    fs.writeFileSync(locksPath, JSON.stringify(locks, null, 2), 'utf8');
}

if (command === 'status') {
    const locks = readLocks();
    if (locks.length === 0) console.log('No active locks.');
    else {
        console.log('Active Locks:');
        locks.forEach(l => console.log(\`- \${l.filePath} (Agent: \${l.agentId})\`));
    }
    process.exit(0);
}

if (!fileArg || !agentId) {
    console.log('Error: <filepath> and <agentId> are required for lock/unlock.');
    process.exit(1);
}

const targetPath = path.resolve(process.cwd(), fileArg);
let locks = readLocks();

if (command === 'lock') {
    const existing = locks.find(l => l.filePath === targetPath);
    if (existing && existing.agentId !== agentId) {
        console.error(\`ERROR: File \${targetPath} is already locked by Agent \${existing.agentId}.\`);
        process.exit(1);
    }
    
    if (!existing) {
        locks.push({ filePath: targetPath, agentId, timestamp: Date.now() });
        writeLocks(locks);
    }
    console.log(\`SUCCESS: Acquired lock on \${targetPath} for Agent \${agentId}\`);
} else if (command === 'unlock') {
    const originalLen = locks.length;
    locks = locks.filter(l => !(l.filePath === targetPath && l.agentId === agentId));
    if (locks.length !== originalLen) {
        writeLocks(locks);
        console.log(\`SUCCESS: Released lock on \${targetPath} for Agent \${agentId}\`);
    } else {
        console.log(\`INFO: No active lock found for \${targetPath} under Agent \${agentId}\`);
    }
}
`;
