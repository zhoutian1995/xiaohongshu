'use client'
import { useState } from 'react'
import type { StoreProfile, JobMode } from '@/lib/types'

const INDUSTRIES = ['美容美发', '餐饮', '健身', '医美', '教育', '零售', '其他']
const PRICE_RANGES = ['低客单(<100)', '中客单(100-500)', '高客单(500+)']
const FREQUENCIES = ['每日', '每周2-3次', '每周1次', '不确定']
const CONVERSION_METHODS = ['私信咨询', '到店消费', '线上购买', '加微信', '电话咨询']

const defaultProfile: StoreProfile = {
  industry: '',
  city: '',
  storeName: '',
  priceRange: '',
  targetAudience: '',
  businessArea: '',
  specialties: [],
  realAdvantages: [],
  filmableAssets: [],
  onCamera: false,
  postFrequency: '',
  conversionMethod: '',
}

interface Props {
  onSubmit: (profile: StoreProfile, mode: JobMode) => void
}

export function StoreProfileForm({ onSubmit }: Props) {
  const [form, setForm] = useState<StoreProfile>(defaultProfile)
  const [mode, setMode] = useState<JobMode>('fast')
  const [submitting, setSubmitting] = useState(false)

  const update = <K extends keyof StoreProfile>(field: K, value: StoreProfile[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.industry || !form.city || !form.storeName) return
    setSubmitting(true)
    onSubmit(form, mode)
  }

  const inputCls = 'w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 transition-colors'
  const selectCls = inputCls + ' appearance-none'
  const labelCls = 'block text-sm font-medium text-foreground mb-1.5'

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            小红书对标分析
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            填写门店信息，AI 将为你发现同城对标账号并生成内容策略
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          {/* 基本信息 */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              基本信息
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>行业 *</label>
                  <select value={form.industry} onChange={e => update('industry', e.target.value)} className={selectCls} required>
                    <option value="">选择行业</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>城市 *</label>
                  <input value={form.city} onChange={e => update('city', e.target.value)} className={inputCls} placeholder="如：杭州" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>区域</label>
                  <input value={form.district ?? ''} onChange={e => update('district', e.target.value)} className={inputCls} placeholder="如：西湖区" />
                </div>
                <div>
                  <label className={labelCls}>门店名称 *</label>
                  <input value={form.storeName} onChange={e => update('storeName', e.target.value)} className={inputCls} placeholder="你的门店名" required />
                </div>
              </div>
            </div>
          </section>

          {/* 定位 */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              定位
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>客单价</label>
                  <select value={form.priceRange} onChange={e => update('priceRange', e.target.value)} className={selectCls}>
                    <option value="">选择客单价</option>
                    {PRICE_RANGES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>目标受众</label>
                  <input value={form.targetAudience} onChange={e => update('targetAudience', e.target.value)} className={inputCls} placeholder="如：25-35岁都市女性" />
                </div>
              </div>
              <div>
                <label className={labelCls}>经营范围</label>
                <textarea value={form.businessArea} onChange={e => update('businessArea', e.target.value)} className={inputCls + ' min-h-[80px] resize-y'} placeholder="你的主要业务和服务" />
              </div>
            </div>
          </section>

          {/* 优势与素材 */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              优势与素材
            </h2>
            <div className="space-y-4">
              <TagInput label="特色项目" value={form.specialties} onChange={v => update('specialties', v)} placeholder="如：日式皮肤管理，按回车添加" />
              <TagInput label="真实优势" value={form.realAdvantages} onChange={v => update('realAdvantages', v)} placeholder="如：5年经验，按回车添加" />
              <TagInput label="可拍摄素材" value={form.filmableAssets} onChange={v => update('filmableAssets', v)} placeholder="如：门店环境，按回车添加" />
            </div>
          </section>

          {/* 内容偏好 */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              内容偏好
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <label className="flex items-center gap-2 mt-6 cursor-pointer">
                  <input type="checkbox" checked={form.onCamera} onChange={e => update('onCamera', e.target.checked)} className="size-4 rounded border-border accent-primary" />
                  <span className="text-sm text-foreground">愿意出镜</span>
                </label>
                <div className="flex-1">
                  <label className={labelCls}>出镜人信息</label>
                  <input value={form.onCameraInfo ?? ''} onChange={e => update('onCameraInfo', e.target.value)} className={inputCls} placeholder="如：店主本人，形象气质好" disabled={!form.onCamera} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>更新频率</label>
                  <select value={form.postFrequency} onChange={e => update('postFrequency', e.target.value)} className={selectCls}>
                    <option value="">选择频率</option>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>现有账号</label>
                  <input value={form.existingAccount ?? ''} onChange={e => update('existingAccount', e.target.value)} className={inputCls} placeholder="小红书号或链接" />
                </div>
              </div>
            </div>
          </section>

          {/* 转化与限制 */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              转化与限制
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>转化方式</label>
                <select value={form.conversionMethod} onChange={e => update('conversionMethod', e.target.value)} className={selectCls}>
                  <option value="">选择方式</option>
                  {CONVERSION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <TagInput label="禁忌话题" value={form.forbiddenTopics ?? []} onChange={v => update('forbiddenTopics', v)} placeholder="如：价格对比，按回车添加" />
            </div>
          </section>

          {/* 模式选择 */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              分析模式
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('fast')}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  mode === 'fast'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-ring'
                }`}
              >
                <div className="text-sm font-medium text-foreground">快速模式</div>
                <div className="mt-1 text-xs text-muted-foreground">约 8 分钟，3 个对标账号，2 条脚本</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('deep')}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  mode === 'deep'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-ring'
                }`}
              >
                <div className="text-sm font-medium text-foreground">深度模式</div>
                <div className="mt-1 text-xs text-muted-foreground">约 15 分钟，5 个对标账号，3 条脚本</div>
              </button>
            </div>
          </section>

          {/* 提交 */}
          <button
            type="submit"
            disabled={submitting || !form.industry || !form.city || !form.storeName}
            className="w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? '提交中...' : '开始分析'}
          </button>
        </form>
      </div>
    </div>
  )
}

// --- Tag Input ---
function TagInput({ label, value, onChange, placeholder }: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')

  const add = () => {
    const tag = input.trim()
    if (tag && !value.includes(tag)) {
      onChange([...value, tag])
      setInput('')
    }
  }

  const remove = (tag: string) => onChange(value.filter(t => t !== tag))

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 transition-colors"
          placeholder={placeholder}
        />
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
              {tag}
              <button type="button" onClick={() => remove(tag)} className="text-muted-foreground hover:text-foreground">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
