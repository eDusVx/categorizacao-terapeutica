import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { parse as csvParse } from 'csv-parse/sync'
import { stringify as csvStringify } from 'csv-stringify/sync'
import { FalaCategorizada } from '../interfaces/FalaCategorizada.interface'

@Injectable()
export class CsvService {
    private readonly logger = new Logger(CsvService.name)

    public parseCsvToTranscription(csvContent: string): { transcricao: string } {
        try {
            this.logger.debug('Iniciando parsing do CSV')

            const cleanContent = csvContent.replace(/^\uFEFF/, '').trim()

            if (!cleanContent) {
                throw new BadRequestException('O arquivo CSV está vazio.')
            }

            const records = csvParse(cleanContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
            })

            this.validateCsvStructure(records)

            const transcricao = this.buildTranscricao(records)

            return { transcricao }
        } catch (error) {
            this.logger.error(`Erro ao processar CSV: ${error.message}`)
            if (error instanceof BadRequestException) throw error
            throw new BadRequestException(`CSV inválido: ${error.message}`)
        }
    }

    public reconstructCsvWithCategorization(categorizedData: FalaCategorizada[]): string {
        try {
            this.logger.debug(`Gerando CSV final com ${categorizedData.length} linhas`)

            return csvStringify(categorizedData, {
                header: true,
                columns: ['falante', 'texto', 'categoria'],
                quoted: true,
            })
        } catch (error) {
            this.logger.error(`Erro ao reconstruir CSV: ${error.message}`)
            throw new Error('Falha ao gerar o arquivo CSV de saída.')
        }
    }

    private validateCsvStructure(records: any[]) {
        if (!records || records.length === 0) {
            throw new BadRequestException('Nenhum registro encontrado no CSV.')
        }
        const firstRecord = records[0]
        const headers = Object.keys(firstRecord).map((h) => h.toLowerCase())

        if (!headers.includes('falante') || !headers.includes('texto')) {
            throw new BadRequestException('Formato inválido. O CSV deve conter as colunas: "falante" e "texto".')
        }
    }

    private buildTranscricao(records: any[]): string {
        const lines = records
            .map((record) => {
                const keys = Object.keys(record)
                const falanteKey = keys.find((k) => k.toLowerCase() === 'falante')
                const textoKey = keys.find((k) => k.toLowerCase() === 'texto')

                if (!falanteKey || !textoKey) return null

                const falante = record[falanteKey]
                const texto = record[textoKey]

                if (!falante || !texto) return null

                return `${falante}: ${texto}`
            })
            .filter((line): line is string => line !== null)

        if (lines.length === 0) {
            throw new BadRequestException('Nenhum dado válido de fala encontrado no CSV.')
        }

        return lines.join('\n')
    }
}
