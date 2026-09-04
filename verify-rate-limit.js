const { run } = require('./src/app/functions/verify-rate-limit');

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});