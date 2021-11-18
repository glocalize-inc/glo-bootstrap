import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { UnknownElementException } from '@nestjs/core/errors/exceptions/unknown-element.exception';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SecuritySchemeObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  AllExceptionFilter,
  AllExceptionWithMessageFilter,
} from '@glocalize-inc/glo-exception-filter';
import {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';

type ApiKeyOptions = {
  securitySchemeObject: SecuritySchemeObject;
  name: string;
};

type BuildSwaggerParams = {
  app: INestApplication;
  serviceName?: string;
  srcRepositoryName: string;
  apiKeyOptions?: Array<ApiKeyOptions>;
  documentPath?: string;
};

function buildSwagger({
  app,
  serviceName,
  apiKeyOptions,
  srcRepositoryName,
  documentPath = 'docs',
}: BuildSwaggerParams) {
  const docsBuilder = new DocumentBuilder().setTitle(
    (serviceName ?? srcRepositoryName).toUpperCase(),
  );
  apiKeyOptions.forEach((options) => {
    docsBuilder.addApiKey(options.securitySchemeObject, options.name);
  });
  SwaggerModule.setup(
    [documentPath, srcRepositoryName, serviceName].filter(Boolean).join('/'),
    app,
    SwaggerModule.createDocument(app, docsBuilder.build()),
  );
}

type BootstrapParams = {
  module: any;
  srcRepositoryName: string;
  /**
   * @default process.env.SERVICE_NAME
   */
  serviceName?: string;
  /**
   * @default 3000
   */
  port?: number | string;
  /**
   * @default '0.0.0.0'
   */
  host?: string;
  /**
   * @default docs
   */
  documentPath?: string;
  /**
   * @default { origin: '*', methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', preflightContinue: false, optionsSuccessStatus: 204, credentials: true }
   *
   * K8s에 구성되는 MSA 특성 상 CORS를 항상 허용한다
   */
  corsOptions?: CorsOptions | CorsOptionsDelegate<any>;
  /**
   * @default detail
   */
  useGloFilter?: 'detail' | 'simple' | 'none';
};

export async function bootstrap({
  module,
  srcRepositoryName,
  serviceName,
  port = 3000,
  host = '0.0.0.0',
  corsOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  },
  useGloFilter = 'detail',
}: BootstrapParams) {
  if (srcRepositoryName === undefined) {
    const error = new UnknownElementException(srcRepositoryName);
    Logger.error(error, 'bootstrap');
    throw error;
  }

  const app: INestApplication = await NestFactory.create(
    module,
    new FastifyAdapter(),
  );
  app.enableCors(corsOptions);

  switch (useGloFilter) {
    case 'simple':
      app.useGlobalFilters(new AllExceptionFilter(app.getHttpAdapter()));
      break;
    case 'detail':
      app.useGlobalFilters(
        new AllExceptionWithMessageFilter(app.getHttpAdapter()),
      );
      break;
    case 'none':
      Logger.warn(
        'useGloFilter를 사용하지 않습니다. 일부 에러의 상태코드가 500으로 전송될 수 있습니다',
      );
      break;
    default:
      throw new UnknownElementException(useGloFilter);
  }

  app.setGlobalPrefix(
    ['api', srcRepositoryName, serviceName].filter(Boolean).join('/'),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      validationError: { target: false, value: false },
      transform: true,
      forbidUnknownValues: true,
      whitelist: true,
    }),
  );

  buildSwagger({
    app,
    srcRepositoryName,
    serviceName,
    apiKeyOptions: [
      {
        securitySchemeObject: { type: 'apiKey', name: 'Authorization' },
        name: 'token',
      },
    ],
  });

  await app.listen(port, host);
}
