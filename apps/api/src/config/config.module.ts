import { DynamicModule, Global, Module } from "@nestjs/common";
import type { AppConfig } from "./env.js";

/** Jeton d'injection de la configuration : `@Inject(APP_CONFIG) private readonly config: AppConfig`. */
export const APP_CONFIG = Symbol("APP_CONFIG");

/**
 * Rend la configuration (déjà validée dans main.ts) disponible partout.
 * La validation a lieu AVANT la création de l'application : en cas d'erreur, rien ne démarre.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
