import { Module } from '@nestjs/common'
import { SimccitModule } from './simccit/simccit.module'

@Module({
    imports: [SimccitModule],
})
export class AppModule {}
