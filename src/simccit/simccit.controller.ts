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
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiConsumes,
    ApiExtraModels,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    getSchemaPath,
} from '@nestjs/swagger'
import { TranscricaoDto } from './dto/Transcricao.dto'
import { FalaCategorizada } from './interfaces/FalaCategorizada.interface'
import { SimccitService } from './services/simccit.service'

@ApiTags('Categorização Terapêutica')
@ApiExtraModels(FalaCategorizada)
@Controller('simccit')
export class SimccitController {
    constructor(private readonly simccitService: SimccitService) {}

    @Post('categorizar-texto')
    @ApiOperation({
        summary: 'Categorização de transcrição de texto',
        description: 'Recebe uma transcrição de falas (texto livre) e retorna cada fala categorizada.',
    })
    @ApiBody({ type: TranscricaoDto })
    @ApiOkResponse({
        description: 'Lista de falas categorizadas',
        schema: {
            type: 'array',
            items: { $ref: getSchemaPath(FalaCategorizada) },
        },
    })
    @ApiBadRequestResponse({ description: 'Transcrição inválida' })
    async categorizeTranscript(@Body() dto: TranscricaoDto): Promise<FalaCategorizada[]> {
        if (!dto.transcricao?.trim()) {
            throw new BadRequestException('A transcrição não pode estar vazia.')
        }
        return this.simccitService.categorizeTranscript(dto.transcricao)
    }

    @Post('categorizar-csv')
    @ApiOperation({
        summary: 'Categorização de arquivo CSV',
        description: 'Recebe um arquivo CSV (falante, texto) e retorna o CSV processado.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Arquivo CSV. Colunas obrigatórias: "falante", "texto".',
                },
            },
        },
    })
    @ApiOkResponse({
        description: 'Arquivo CSV categorizado',
        content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
    })
    @UseInterceptors(FileInterceptor('file'))
    async categorizeCsvFile(
        @UploadedFile()
        file: Express.Multer.File,
    ): Promise<StreamableFile> {
        if (!file) {
            throw new BadRequestException('Arquivo não enviado.')
        }
        const isCsv =
            file.mimetype.includes('csv') ||
            file.mimetype.includes('excel') ||
            file.mimetype === 'text/plain' ||
            file.originalname.toLowerCase().endsWith('.csv')

        if (!isCsv) {
            throw new BadRequestException('O arquivo deve ser um CSV válido.')
        }

        const csvContent = file.buffer.toString('utf-8')
        const resultCsvString = await this.simccitService.categorizeCsv(csvContent)

        return new StreamableFile(Buffer.from(resultCsvString, 'utf-8'), {
            type: 'text/csv',
            disposition: `attachment; filename="categorizado_${file.originalname}"`,
        })
    }

    @Get('example-csv-format')
    @ApiOperation({ summary: 'Download de exemplo de formato CSV' })
    getExampleCsvFormat(): StreamableFile {
        const exampleCsv = `falante,texto
Terapeuta,"Bom dia, como você está?"
Cliente,"Estou me sentindo um pouco ansioso hoje."`

        return new StreamableFile(Buffer.from(exampleCsv, 'utf-8'), {
            type: 'text/csv',
            disposition: `attachment; filename="exemplo_simccit.csv"`,
        })
    }
}
