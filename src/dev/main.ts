import { bootstrap } from '../lib';
import { AppModule } from './app.module';
import { srcRepositoryName } from './env';

bootstrap({ module: AppModule, srcRepositoryName });
