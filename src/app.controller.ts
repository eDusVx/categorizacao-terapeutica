import { join } from 'path'
import { Controller, Get, Res } from '@nestjs/common'
import { Response } from 'express'

@Controller()
export class AppController {
    @Get('hello')
    getHello(): string {
        return 'Hello World!'
    }

    @Get()
    root(@Res() res: Response) {
        res.sendFile(join(__dirname, '..', '..', 'public', 'index.html'))
    }
}
