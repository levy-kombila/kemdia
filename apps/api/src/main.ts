import "reflect-metadata";
import { existsSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { ConfigError, loadConfig, type AppConfig } from "./config/env.js";
import { configureApp } from "./http/configure-app.js";

async function bootstrap(): Promise<void> {
  // 1. Configuration validée AVANT tout le reste : une erreur arrête l'API immédiatement.
  //    Le fichier .env ne sert qu'au poste de développement ; en production, les variables viennent du conteneur.
  if (process.env.NODE_ENV !== "production" && existsSync(".env")) process.loadEnvFile(".env");
  let config: AppConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  // 2. Application
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app, config);

  await app.listen(config.PORT, config.HOST);
  app
    .get(Logger)
    .log(`API Kemdia ${config.APP_VERSION} prête sur le port ${config.PORT} (${config.APP_ENV})`);
}

void bootstrap();
