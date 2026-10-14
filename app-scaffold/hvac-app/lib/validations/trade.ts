import { z } from 'zod'
import { TRADE_IDS } from '@/lib/trades'

export const tradeTypeSchema = z.enum(TRADE_IDS, {
  errorMap: () => ({ message: 'Choose a supported business trade' }),
})

export const updateTradeSchema = z.object({ tradeType: tradeTypeSchema })
