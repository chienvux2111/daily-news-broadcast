/**
 * Streams Config — JSON file loader
 * Reads stream definitions from a JSON config file at startup.
 * Config is read-only at runtime — edit the JSON file to change streams.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load streams from a JSON config file.
 * @param {string} [configPath] - Path to config file. Defaults to ../../streams.config.json
 * @returns {{ streams: object[] }}
 */
export function loadConfig(configPath) {
  const path = configPath || resolve(__dirname, '../../streams.config.json');
  try {
    const raw = readFileSync(path, 'utf-8');
    const config = JSON.parse(raw);
    const streams = (config.streams || []).map((s, i) => ({
      id: s.id || `stream-${i}`,
      name: s.name || `Stream ${i + 1}`,
      enabled: s.enabled !== false,
      cron: s.cron || '0 7 * * *',
      timezone: s.timezone || 'UTC',
      sources: s.sources || [],
      ai: s.ai || null,
      outputs: s.outputs || [],
      options: s.options || {},
    }));
    return { streams, configPath: path };
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`[Config] File not found: ${path}`);
      console.error(`[Config] Create streams.config.json — see streams.config.example.json`);
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Get a stream by ID from a loaded config.
 */
export function getStream(streams, id) {
  return streams.find(s => s.id === id) || null;
}
