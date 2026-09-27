import { documentDateSchema, MAX_DOCUMENT_CENTS } from './document'
import { z } from 'zod'

export const EQUIPMENT_TYPES = [
  'ac_condenser',
  'furnace',
  'heat_pump',
  'mini_split',
  'boiler',
  'water_heater',
  'thermostat',
  'air_handler',
  'ductwork',
  'other',
] as const

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  ac_condenser: 'AC Condenser',
  furnace: 'Furnace',
  heat_pump: 'Heat Pump',
  mini_split: 'Mini-Split',
  boiler: 'Boiler',
  water_heater: 'Water Heater',
  thermostat: 'Thermostat',
  air_handler: 'Air Handler',
  ductwork: 'Ductwork',
  other: 'Other',
}

const optionalString = (max: number) => z.string().max(max).optional().or(z.literal('')).transform((v) => v || undefined)
const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().finite().min(0).optional(),
)

const optionalInteger = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().int().min(0).max(MAX_DOCUMENT_CENTS).optional(),
)

export const createEquipmentSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  type: z.enum(EQUIPMENT_TYPES, { errorMap: () => ({ message: 'Pick an equipment type' }) }),
  make: optionalString(100),
  model: optionalString(100),
  serial: optionalString(100),
  installDate: documentDateSchema,
  installedByUs: z.boolean().optional().default(false),
  installerName: optionalString(150),
  tonnage: optionalNumber,
  seer: optionalNumber,
  refrigerantType: optionalString(50),
  btu: optionalInteger,
  locationOnProperty: optionalString(200),
  warrantyStartDate: documentDateSchema,
  partsWarrantyMonths: optionalInteger,
  laborWarrantyMonths: optionalInteger,
  notes: optionalString(2000),
})

export const updateEquipmentSchema = createEquipmentSchema.omit({ customerId: true }).extend({
  status: z.enum(['active', 'retired']).optional(),
})

export const SERVICE_RECORD_TYPES = ['tune-up', 'repair', 'install', 'inspection', 'warranty', 'other'] as const
export type ServiceRecordType = (typeof SERVICE_RECORD_TYPES)[number]

export const createServiceRecordSchema = z.object({
  equipmentId: z.string().min(1),
  serviceType: z.enum(SERVICE_RECORD_TYPES),
  description: optionalString(2000),
  performedAt: documentDateSchema.refine((value): value is string => typeof value === 'string' && value.length > 0, 'Date is required'),
  jobId: z.string().optional(),
})

export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>
