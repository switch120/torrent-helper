import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: allowedCorsOrigins(),
  });

  const port = Number(process.env.PORT || 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();

function allowedCorsOrigins(): string[] {
  const configuredOrigins = (process.env.RELEASE_WEB_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0
    ? configuredOrigins
    : ["http://localhost:4200", "http://127.0.0.1:4200"];
}
