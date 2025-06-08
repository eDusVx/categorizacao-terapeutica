import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    StreamableFile,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { TranscricaoDto } from './dto/Transficao.dto'
import { FalaCategorizada } from './interfaces/FalaCategorizada.interface'
import { IUploadedFile } from './interfaces/UploadedFile.interface'
import { SimccitService } from './services/simccit.service'

@Controller('simccit')
export class SimccitController {
    constructor(private readonly simccitService: SimccitService) {}

    @Post('categorizar-texto')
    async categorizeTranscript(@Body() categorizeTranscriptDto: TranscricaoDto): Promise<FalaCategorizada[]> {
        if (!categorizeTranscriptDto.transcricao || categorizeTranscriptDto.transcricao.trim() === '') {
            throw new BadRequestException('Transcrição não pode estar vazia')
        }
        return this.simccitService.categorizeTranscript(categorizeTranscriptDto.transcricao)
    }

    @Post('categorizar-csv')
    @UseInterceptors(FileInterceptor('file'))
    async categorizeCsvFile(@UploadedFile() file: IUploadedFile) {
        if (!file) {
            throw new BadRequestException('Arquivo não enviado')
        }
        if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
            throw new BadRequestException('O arquivo deve ser um CSV')
        }
        const csvContent = file.buffer.toString('utf-8')
        const result = await this.simccitService.categorizeCsv(csvContent)
        return new StreamableFile(Buffer.from(result, 'utf-8'), {
            type: 'text/csv',
            disposition: `attachment; filename="categorized_${file.originalname}"`,
        })
    }

    @Get('example-csv-format')
    getExampleCsvFormat() {
        const exampleCsv = `falante,texto,categoria
            Terapeuta,"Bom dia, como você está se sentindo hoje?",
            Cliente,"Tenho me sentido bastante ansioso ultimamente, especialmente no trabalho."`

        return new StreamableFile(Buffer.from(exampleCsv, 'utf-8'), {
            type: 'text/csv',
            disposition: `attachment; filename="example_format.csv"`,
        })
    }
}
