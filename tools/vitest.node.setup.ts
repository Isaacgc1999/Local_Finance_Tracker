// `node:sqlite` emite un ExperimentalWarning en cada worker; lo silenciamos
// para que la salida de los tests sea legible. El resto de avisos se conservan.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name !== 'ExperimentalWarning') console.warn(warning);
});
