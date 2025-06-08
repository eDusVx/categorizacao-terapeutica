import { join } from 'path'
import { Controller, Get, Res } from '@nestjs/common'
import { Response } from 'express'
import { AppService } from './app.service'

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get('hello')
    getHello(): string {
        return this.appService.getHello()
    }

    @Get()
    root(@Res() res: Response) {
        res.sendFile(join(__dirname, '..', '..', 'public', 'index.html'))
    }
}
