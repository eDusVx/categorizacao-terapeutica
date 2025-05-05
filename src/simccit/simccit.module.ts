import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { CsvService } from './csv.service'
import { SimccitController } from './simccit.controller'
import { SimccitService } from './simccit.service'

@Module({
    imports: [
        HttpModule,
        MulterModule.register({
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    ],
    controllers: [SimccitController],
    providers: [SimccitService, CsvService],
})
export class SimccitModule {}
