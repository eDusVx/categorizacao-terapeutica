import { Module } from '@nestjs/common'
import { SimccitModule } from './simccit/simccit.module'
import { AppController } from './app.controller'

@Module({
    imports: [SimccitModule],
    controllers: [AppController],
})
export class AppModule {}
