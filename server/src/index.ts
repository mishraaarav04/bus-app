import { config } from "./config.js";
import { seedDemo } from "./data/seed.js";
import { buildServer } from "./app.js";

const { httpServer } = buildServer();

httpServer.listen(config.port, async () => {
  console.log(`Wheelie server listening on :${config.port}`);
  if (config.seedDemo) await seedDemo();
});
