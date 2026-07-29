import { config } from "./config";
import { buildApp } from "./app";

const start = async () => {
  const app = buildApp();

  try {
    await app.listen({
      port: config.port,
      host: "0.0.0.0",
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
