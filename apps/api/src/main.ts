import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: true,
  });

  const port = Number(process.env.PORT || 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
