import { existsSync, readFileSync, writeFileSync } from 'fs'
import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import { CsvService } from './csv.service'
import { FalaCategorizada } from './interfaces/FalaCategorizada.interface'
import * as pdfParse from 'pdf-parse'

@Injectable()
export class SimccitService {
    private readonly logger = new Logger(SimccitService.name)

    constructor(
        private readonly httpService: HttpService,
        private readonly csvService: CsvService,
    ) {}

    private buildPrompt(transcricao: string, pdfText: string): string {
        return `
Você é um especialista em categorização de interações terapêuticas, utilizando o Sistema Multidimensional de Categorização de Comportamentos da Interação Terapêutica (SiMCCIT).

Utilize o manual detalhado do SiMCCIT (enviado como PDF) para consultar as definições e critérios de inclusão/exclusão.

Manual detalhado do SiMCCIT:
${pdfText}

Sua tarefa é analisar a transcrição da sessão terapêutica fornecida abaixo e categorizar cada verbalização individual (turno de fala de um falante) ou segmentos dentro de uma verbalização.

Concentre-se estritamente nas categorias do Eixo I-1 (Comportamento Verbal Vocal do Terapeuta) e Eixo I-3 (Comportamento Verbal Vocal do Cliente). As categorias permitidas são:

Para o Terapeuta (Eixo I-1):
SRE (Solicitação de relato)
FAC (Facilitação)
EMP (Empatia)
INF (Informação)
SRF (Solicitação de Reflexão)
REC (Recomendação)
INT (Interpretação)
APR (Aprovação)
REP (Reprovação)
TOU (Outras vocal terapeuta)

Para o Cliente (Eixo I-3):
SOL (Solicitação)
REL (Relato)
MEL (Melhora)
MET (Metas)
CER (Relações)
CON (Concordância)
OPO (Oposição)
COU (Outras vocal cliente)

Regras de Segmentação e Categorização:
Analise cada verbalização completa de um falante por vez, lendo-a da transcrição.
Aplique rigorosamente as definições e critérios de inclusão/exclusão do manual para as categorias do Eixo I-1 e Eixo I-3.
Se uma única verbalização contiver partes distintas que se enquadram em categorias diferentes dentro do Eixo I-1 ou I-3 de acordo com o manual, divida essa verbalização em múltiplos segmentos. Cada segmento deve ser o menor trecho de texto da transcrição que se encaixa completamente em UMA ÚNICA categoria SiMCCIT do Eixo I-1 ou I-3.
Para cada segmento identificado, crie um objeto JSON.
A categoria a ser atribuída deve ser a sigla exata da categoria conforme consta na lista acima e no manual.

Formato de Saída:
Sua saída deve ser APENAS um array JSON. Não inclua nenhum texto explicativo, introdução, conclusão, ou qualquer outra coisa fora do array JSON.

Cada objeto dentro do array JSON deve representar um segmento categorizado e conter EXATAMENTE as seguintes chaves e tipos de dados:
"falante": (string) O nome do falante (Terapeuta ou Cliente).
"texto": (string) O segmento exato do texto da verbalização.
"categoria": (string) A sigla exata da categoria SiMCCIT (Eixo I-1 ou I-3).

Transcrição:
${transcricao}
`
    }

    async categorizeTranscript(transcricao: string): Promise<FalaCategorizada[]> {
        try {
            this.logger.debug('Iniciando a categorização dos dados')

            const apiResponse = await this.callCategorizationApi(transcricao)

            return this.processApiResponse(apiResponse)
        } catch (error) {
            this.logger.error(`Erro ao categorizar transcrição: ${error.message}`)
            throw error
        }
    }

    private async callCategorizationApi(transcricao: string) {
        const apiUrl = process.env.API_URL
        const apiKey = process.env.API_KEY
        const model = process.env.MODEL
        const pdfPath = process.env.PDF_PATH

        if (!apiUrl) throw new Error('Configuração da API incompleta')

        if (!pdfPath || !existsSync(pdfPath)) throw new Error('Arquivo PDF não encontrado')

        const pdfText = await this.extractPdfText(pdfPath)

        const messages = [
            {
                role: 'user',
                content: this.buildPrompt(transcricao, pdfText),
            },
        ]

        const headers = {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        }

        return lastValueFrom(
            this.httpService.post(
                apiUrl,
                {
                    model: model,
                    messages: messages,
                },
                {
                    headers: headers,
                },
            ),
        )
    }

    async categorizeCsv(csvContent: string): Promise<string> {
        try {
            const parseResult = this.csvService.parseCsvToTranscription(csvContent)
            const categorizedData = await this.categorizeTranscript(parseResult.transcricao)

            if (!categorizedData?.length) {
                throw new Error('Falha ao categorizar os dados')
            }
            this.logger.debug('Montando arquivo csv de retorno')
            return this.csvService.reconstructCsvWithCategorization(parseResult, categorizedData)
        } catch (error) {
            this.logger.error(`Erro ao categorizar CSV: ${error.message}`)
            throw error
        }
    }

    private async processApiResponse(response: any): Promise<FalaCategorizada[]> {
        if (!response.data.choices?.length) {
            this.logger.error('Resposta da API inválida:', response.data)
            throw new Error('Erro na resposta da API')
        }
        this.logger.debug('Resposta recebida e sendo tratada')

        const output = response.data.choices[0].message.content

        try {
            return await this.parseApiOutput(output)
        } catch (error) {
            this.logger.error('Erro ao processar resposta da API:', error)
            return await this.fallbackResponseParsing(output)
        }
    }

    private async parseApiOutput(output: string): Promise<FalaCategorizada[]> {
        const jsonMatch = output.match(/\[\s*\{[\s\S]*\}\s*\]/)
        let jsonStr = ''

        if (jsonMatch) {
            jsonStr = jsonMatch[0]
        } else {
            jsonStr = output.replace(/^\`\`\`json|^\`\`\`|\`\`\`$/gm, '').trim()

            if (!jsonStr.startsWith('[') || !jsonStr.endsWith(']')) {
                const startIndex = jsonStr.indexOf('[')
                const endIndex = jsonStr.lastIndexOf(']')

                if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                    jsonStr = jsonStr.substring(startIndex, endIndex + 1)
                }
            }
        }

        const data = JSON.parse(jsonStr) as FalaCategorizada[]
        await this.saveOutput(data)
        return data
    }

    private async fallbackResponseParsing(output: string): Promise<FalaCategorizada[]> {
        this.logger.debug('Tentando extrair categorias manualmente da resposta...')

        const regex = /"falante"\s*:\s*"([^"]+)"\s*,\s*"texto"\s*:\s*"([^"]+)"\s*,\s*"categoria"\s*:\s*"([^"]+)"/g
        const matches = [...output.matchAll(regex)]

        if (matches.length > 0) {
            const data: FalaCategorizada[] = matches.map((match) => ({
                falante: match[1],
                texto: match[2],
                categoria: match[3],
            }))

            this.logger.debug(`Extraídas ${data.length} categorizações manualmente`)
            await this.saveOutput(data)
            return data
        }

        throw new Error('Não foi possível extrair categorias da resposta')
    }

    private async saveOutput(data: FalaCategorizada[]): Promise<void> {
        try {
            const outputPath = process.env.OUTPUT_PATH
            if (!outputPath) {
                throw new Error('OUTPUT_PATH não configurado')
            }

            writeFileSync(outputPath, JSON.stringify(data, null, 2), { encoding: 'utf8' })

            this.logger.debug(`Categorização salva em '${outputPath}'`)
        } catch (error) {
            this.logger.error('Erro ao salvar output:', error)
        }
    }

    private async extractPdfText(pdfPath: string): Promise<string> {
        const dataBuffer = readFileSync(pdfPath)
        const data = await pdfParse(dataBuffer)
        return data.text
    }
}
