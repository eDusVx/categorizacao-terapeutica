import { InternalServerErrorException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FalaCategorizada } from '../interfaces/FalaCategorizada.interface'
import { CsvService } from './csv.service'
import { SimccitService } from './simccit.service'

const mockCsvService = {
    parseCsvToTranscription: vi.fn(),
    reconstructCsvWithCategorization: vi.fn(),
}

const mockEnv = {
    API_URL: 'http://fake-api',
    API_KEY: 'fake-key',
    MODEL: 'gpt-3.5-turbo',
}

vi.stubGlobal('process', { env: mockEnv })

describe('SimccitService', () => {
    let service: SimccitService
    let mockLogger: { log: any; error: any; warn: any; debug: any }
    let mockChainInvoke: any
    let mockChain: any
    let mockModelPipe: any
    let mockFormattedPrompt: any
    let mockParser: any

    beforeEach(() => {
        mockLogger = {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        }

        mockChainInvoke = vi.fn()
        mockChain = { invoke: mockChainInvoke }

        mockModelPipe = {
            pipe: vi.fn().mockReturnValue(mockChain),
        }

        mockFormattedPrompt = {
            pipe: vi.fn().mockReturnValue(mockModelPipe),
        }

        mockParser = {
            getFormatInstructions: vi.fn().mockReturnValue('instrucoes json'),
        }

        service = new SimccitService(mockCsvService as unknown as CsvService)

        Object.defineProperty(service, 'logger', { value: mockLogger })
        Object.defineProperty(service, 'formattedPrompt', { value: mockFormattedPrompt, writable: true })
        Object.defineProperty(service, 'model', { value: {}, writable: true })
        Object.defineProperty(service, 'parser', { value: mockParser, writable: true })

        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('onModuleInit', () => {
        it('deve logar erro se API_KEY não estiver definida', () => {
            const originalKey = process.env.API_KEY
            process.env.API_KEY = undefined

            const localService = new SimccitService(mockCsvService as unknown as CsvService)
            Object.defineProperty(localService, 'logger', { value: mockLogger })

            try {
                localService.onModuleInit()
            } catch (e) {}

            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('API_KEY'))

            process.env.API_KEY = originalKey
        })
    })

    describe('categorizeTranscript', () => {
        it('deve retornar array vazio se transcrição for vazia ou nula', async () => {
            const resultEmpty = await service.categorizeTranscript('')
            const resultNull = await service.categorizeTranscript(null as unknown as string)

            expect(resultEmpty).toEqual([])
            expect(resultNull).toEqual([])
            expect(mockChainInvoke).not.toHaveBeenCalled()
        })

        it('deve chamar a chain do LangChain e retornar os dados categorizados', async () => {
            const mockOutput: FalaCategorizada[] = [{ falante: 'Terapeuta', texto: 'Oi', categoria: 'SRE' }]

            mockChainInvoke.mockResolvedValue(mockOutput)

            const transcricao = 'Oi'
            const result = await service.categorizeTranscript(transcricao)

            expect(mockFormattedPrompt.pipe).toHaveBeenCalled()
            expect(mockModelPipe.pipe).toHaveBeenCalled()
            expect(mockChainInvoke).toHaveBeenCalledWith({
                transcricao: transcricao,
                format_instructions: 'instrucoes json',
            })
            expect(result).toEqual(mockOutput)
        })

        it('deve lançar InternalServerErrorException se a Chain falhar', async () => {
            mockChainInvoke.mockRejectedValue(new Error('Erro na OpenAI'))

            await expect(service.categorizeTranscript('Texto válido')).rejects.toThrow(InternalServerErrorException)
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Erro na OpenAI'))
        })
    })

    describe('categorizeCsv', () => {
        it('deve lançar InternalServerErrorException se o CSV parseado não tiver transcrição', async () => {
            mockCsvService.parseCsvToTranscription.mockReturnValue({ transcricao: '' })

            await expect(service.categorizeCsv('csv invalido')).rejects.toThrow(InternalServerErrorException)
        })

        it('deve processar o fluxo completo: Parse -> Categorize -> Reconstruct', async () => {
            mockCsvService.parseCsvToTranscription.mockReturnValue({ transcricao: 'Texto CSV' })

            const mockCategorias: FalaCategorizada[] = [{ falante: 'Terapeuta', texto: 'Texto CSV', categoria: 'SRE' }]
            vi.spyOn(service, 'categorizeTranscript').mockResolvedValue(mockCategorias)

            mockCsvService.reconstructCsvWithCategorization.mockReturnValue('csv-final,reconstruido')

            const result = await service.categorizeCsv('csv-entrada')

            expect(mockCsvService.parseCsvToTranscription).toHaveBeenCalledWith('csv-entrada')
            expect(service.categorizeTranscript).toHaveBeenCalledWith('Texto CSV')
            expect(mockCsvService.reconstructCsvWithCategorization).toHaveBeenCalledWith(mockCategorias)
            expect(result).toBe('csv-final,reconstruido')
        })

        it('deve lançar InternalServerErrorException se a categorização retornar vazio', async () => {
            mockCsvService.parseCsvToTranscription.mockReturnValue({ transcricao: 'Texto CSV' })
            vi.spyOn(service, 'categorizeTranscript').mockResolvedValue([])

            await expect(service.categorizeCsv('csv-entrada')).rejects.toThrow(InternalServerErrorException)
        })

        it('deve relançar erro original do CsvService', async () => {
            const erro = new InternalServerErrorException('Erro CSV')
            mockCsvService.parseCsvToTranscription.mockImplementation(() => {
                throw erro
            })

            await expect(service.categorizeCsv('csv')).rejects.toThrow(InternalServerErrorException)
        })
    })
})
