import { spawn } from 'node:child_process';
import process from 'node:process';

// Terminal colors for prefixes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const BLUE = '\x1b[34m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

function prefixOutput(stream, prefix, color) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep unfinished line in buffer
    for (const line of lines) {
      if (line.trim().length > 0) {
        process.stdout.write(`${color}${BOLD}[${prefix}]${RESET} ${line}\n`);
      }
    }
  });
  stream.on('end', () => {
    if (buffer.trim().length > 0) {
      process.stdout.write(`${color}${BOLD}[${prefix}]${RESET} ${buffer}\n`);
    }
  });
}

console.log(`${BOLD}Starting ResearchForge development servers...${RESET}`);

// Start backend server
const server = spawn('npm', ['run', 'dev', '--prefix', 'server'], {
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});
prefixOutput(server.stdout, 'server', BLUE);
prefixOutput(server.stderr, 'server', RED);

// Start frontend client
const client = spawn('npm', ['run', 'dev', '--prefix', 'client'], {
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});
prefixOutput(client.stdout, 'client', GREEN);
prefixOutput(client.stderr, 'client', RED);

let shuttingDown = false;

function terminateAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${BOLD}Shutting down development servers...${RESET}`);

  try {
    server.kill('SIGINT');
  } catch (err) {
    // ignore
  }

  try {
    client.kill('SIGINT');
  } catch (err) {
    // ignore
  }

  // Fallback SIGKILL after timeout
  setTimeout(() => {
    try {
      server.kill('SIGKILL');
    } catch (err) {}
    try {
      client.kill('SIGKILL');
    } catch (err) {}
    process.exit(exitCode);
  }, 1000).unref();
}

server.on('error', (err) => {
  console.error(`${RED}${BOLD}[server error]${RESET} Failed to spawn server process: ${err.message}`);
  terminateAll(1);
});

client.on('error', (err) => {
  console.error(`${RED}${BOLD}[client error]${RESET} Failed to spawn client process: ${err.message}`);
  terminateAll(1);
});

server.on('exit', (code, signal) => {
  if (!shuttingDown) {
    console.log(`${RED}${BOLD}[server]${RESET} Process exited with code ${code || signal}`);
    terminateAll(code || 1);
  }
});

client.on('exit', (code, signal) => {
  if (!shuttingDown) {
    console.log(`${RED}${BOLD}[client]${RESET} Process exited with code ${code || signal}`);
    terminateAll(code || 1);
  }
});

process.on('SIGINT', () => terminateAll(0));
process.on('SIGTERM', () => terminateAll(0));

