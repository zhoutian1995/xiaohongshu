import { z } from 'zod'

export const CreateJobSchema = z.object({
  // Required fields
  industry: z.string().min(1, '行业不能为空'),
  city: z.string().min(1, '城市不能为空'),
  storeName: z.string().min(1, '门店名称不能为空'),

  // Mode with default
  mode: z.enum(['fast', 'deep']).default('fast'),

  // Optional fields with defaults
  district: z.string().default(''),
  priceRange: z.string().default('未提供'),
  targetAudience: z.string().default('未提供'),
  businessArea: z.string().default(''),
  specialties: z.array(z.string()).default([]),
  realAdvantages: z.array(z.string()).default([]),
  filmableAssets: z.array(z.string()).default([]),
  onCamera: z.boolean().default(false),
  onCameraInfo: z.string().default(''),
  postFrequency: z.string().default('未提供'),
  existingAccount: z.string().default(''),
  forbiddenTopics: z.array(z.string()).default([]),
  conversionMethod: z.string().default('私信咨询'),
})
