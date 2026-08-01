// filepath: src/utils/logger.js
// Logger minimalista con niveles. En producción es JSON-friendly, en dev
// es legible. Se puede reemplazar por pino/winston sin tocar el resto del
// código (todos los módulos importan desde acá).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const currentLevel = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function fmt(level, args) {
  const ts = new Date().toISOString();
  const tag = level.toUpperCase().padEnd(5, ' ');
  return [`[${ts}] ${tag}`, ...args];
}

export const logger = {
  debug: (...args) => currentLevel <= LEVELS.debug && console.debug(...fmt('debug', args)),
  info: (...args) => currentLevel <= LEVELS.info && console.info(...fmt('info', args)),
  warn: (...args) => currentLevel <= LEVELS.warn && console.warn(...fmt('warn', args)),
  error: (...args) => currentLevel <= LEVELS.error && console.error(...fmt('error', args)),
};

export default logger;
