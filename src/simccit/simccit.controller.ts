import { Controller, Post, Body, Get, UseInterceptors, Res, HttpStatus, UploadedFile } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { SimccitService } from './simccit.service'
import { TranscricaoDto } from './dto/Transficao.dto'
import { FalaCategorizada } from './interfaces/FalaCategorizada.interface'
import { IUploadedFile } from './interfaces/UploadedFile.interface'

@Controller('categorizacao')
export class SimccitController {
    constructor(private readonly simccitService: SimccitService) {}

    @Post('categorizar-texto')
    async categorizeTranscript(@Body() categorizeTranscriptDto: TranscricaoDto): Promise<FalaCategorizada[]> {
        return this.simccitService.categorizeTranscript(categorizeTranscriptDto.transcricao)
    }

    @Post('categorizar-csv')
    @UseInterceptors(FileInterceptor('file'))
    async categorizeCsvFile(@UploadedFile() file: IUploadedFile, @Res() res: Response) {
        if (!file) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                message: 'Nenhum arquivo foi enviado',
            })
        }

        if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                message: 'O arquivo deve ser um CSV',
            })
        }

        try {
            const csvContent = file.buffer.toString('utf-8')
            const result = await this.simccitService.categorizeCsv(csvContent)

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename="categorized_${file.originalname}"`)

            return res.send(result)
        } catch (error) {
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                message: 'Erro ao processar o arquivo CSV',
                error: error.message,
            })
        }
    }

    @Get('example-csv-format')
    getExampleCsvFormat(@Res() res: Response) {
        const exampleCsv = `falante,texto,categorizacao
Terapeuta,"Bom dia, como você está se sentindo hoje?",
Cliente,"Tenho me sentido bastante ansioso ultimamente, especialmente no trabalho."`
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', 'attachment; filename="exemplo_formato.csv"')
        return res.send(exampleCsv)
    }
}
