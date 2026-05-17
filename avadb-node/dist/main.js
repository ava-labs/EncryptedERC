"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: true }));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('AvaDB Node API')
        .setDescription('REST API for querying and retrieving data from an AvaDB replicator node')
        .setVersion('1.0.0')
        .addTag('AvaDB')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('docs', app, document);
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`AvaDB node running on http://localhost:${port}`);
    console.log(`Swagger docs:         http://localhost:${port}/docs`);
}
bootstrap().catch((err) => {
    console.error('Fatal error during bootstrap:', err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map