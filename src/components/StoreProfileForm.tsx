'use client'
import { useState } from 'react'
import type { StoreProfile, JobMode } from '@/lib/types'

const INDUSTRIES = ['美容美发', '皮肤管理', '美甲美睫', '医美', '餐饮', '健身', '教育', '零售', '其他']
const PRICE_RANGES = ['0-200', '200-500', '500-1000', '1000+']
const FREQUENCIES = ['每日', '每周 3-5 条', '每周 1-2 条', '不确定']
const CONVERSION_METHODS = ['私信咨询', '到店消费', '线上购买', '加微信', '电话咨询']
const SPECIALTY_OPTIONS = ['日式皮肤管理', '痘肌修复', '抗衰护理', '美甲美睫', '到店案例多', '面部清洁', '头皮护理', '身体塑形']
const ON_CAMERA_OPTIONS = ['愿意出镜', '不愿意出镜', '偶尔出镜'] as const

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

const STEPS = [
  { index: '01', title: '基础信息' },
  { index: '02', title: '经营定位' },
  { index: '03', title: '优势素材' },
  { index: '04', title: '内容偏好' },
  { index: '05', title: '运行分析' },
] as const

export function StoreProfileForm({ onSubmit }: Props) {
  const [form, setForm] = useState<StoreProfile>(defaultProfile)
  const [mode, setMode] = useState<JobMode>('deep')
  const [submitting, setSubmitting] = useState(false)

  const update = <K extends keyof StoreProfile>(field: K, value: StoreProfile[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const toggleSpecialty = (item: string) => {
    setForm(prev => ({
      ...prev,
      specialties: prev.specialties.includes(item)
        ? prev.specialties.filter(s => s !== item)
        : [...prev.specialties, item],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.industry || !form.city || !form.storeName) return
    setSubmitting(true)
    onSubmit(form, mode)
  }

  // Determine which step is active based on filled fields
  const getActiveStep = (): number => {
    if (!form.industry || !form.city || !form.storeName) return 0
    if (!form.priceRange && !form.targetAudience && !form.businessArea) return 1
    if (form.specialties.length === 0 && form.realAdvantages.length === 0) return 2
    if (!form.postFrequency) return 3
    return 4
  }

  const currentStep = getActiveStep()

  // --- Shared styles ---
  const monoFont: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '50px',
    border: '1px solid #d8cbbb',
    borderRadius: '14px',
    background: 'rgba(255,255,255,0.56)',
    padding: '0 15px',
    color: '#191714',
    fontSize: '14px',
    outline: 'none',
    boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset',
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    height: 'auto',
    minHeight: '94px',
    padding: '14px 15px',
    resize: 'vertical',
    lineHeight: '1.7',
  }

  return (
    <>
      {/* ---- 5-Step Workflow ---- */}
      <section className="mb-6 grid grid-cols-5 gap-[10px]">
        {STEPS.map((step, i) => (
          <div
            key={step.index}
            className="min-h-[74px] rounded-2xl border p-[14px] transition-all duration-200"
            style={{
              borderColor: i <= currentStep ? '#191714' : '#d8cbbb',
              background: i <= currentStep ? '#191714' : 'rgba(251,248,241,0.74)',
              color: i <= currentStep ? '#fbf8f1' : '#191714',
              boxShadow: i === currentStep ? '6px 6px 0 rgba(25,23,20,0.14)' : 'none',
            }}
          >
            <div
              className="mb-2 text-[11px]"
              style={{
                ...monoFont,
                color: i <= currentStep ? '#f2a37d' : '#c15f3c',
              }}
            >
              {step.index}
            </div>
            <div className="text-sm font-bold tracking-tight">{step.title}</div>
          </div>
        ))}
      </section>

      {/* ---- Split Layout: Preview + Form ---- */}
      <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[390px_1fr]">
        {/* Left: Sticky Preview Panel */}
        <aside
          className="sticky top-6 rounded-[28px] border p-[22px]"
          style={{
            background: 'rgba(251,248,241,0.88)',
            borderColor: '#d8cbbb',
            boxShadow: '0 22px 70px rgba(45,35,24,0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            className="mb-[10px] text-xs uppercase tracking-[0.08em]"
            style={{ ...monoFont, color: '#8f3f25' }}
          >
            report preview
          </div>
          <div className="mb-2 text-2xl font-extrabold tracking-tight" style={{ letterSpacing: '-0.045em' }}>
            不是填表，是启动一条分析链路
          </div>
          <div className="mb-[18px] text-[13px] leading-[1.75]" style={{ color: '#6f675c' }}>
            左侧预览让用户提前知道最终交付物，降低输入压力，同时强化"AI Agent 正在做事"的产品心智。
          </div>

          {/* Dark report card */}
          <div
            className="mb-[14px] rounded-[22px] border p-[18px]"
            style={{ background: '#191714', color: '#fbf8f1', borderColor: '#191714' }}
          >
            <div className="mb-[14px] flex items-center justify-between">
              <strong className="text-sm tracking-tight">同行内容类型占比</strong>
              <span
                className="rounded-full border px-2 py-[3px] text-[11px]"
                style={{
                  ...monoFont,
                  background: 'rgba(242,163,125,0.13)',
                  color: '#f2a37d',
                  borderColor: 'rgba(242,163,125,0.18)',
                }}
              >
                sample
              </span>
            </div>
            {[
              { label: 'case_showcase', pct: 42 },
              { label: 'avoid_mistakes', pct: 31 },
              { label: 'founder_ip', pct: 18 },
            ].map(item => (
              <div key={item.label} className="mb-[14px] last:mb-0">
                <div
                  className="mb-[7px] flex justify-between text-xs"
                  style={{ ...monoFont, color: '#afa597' }}
                >
                  <span>{item.label}</span>
                  <span>{item.pct}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full"
                  style={{ background: 'rgba(255,255,255,0.11)' }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${item.pct}%`, background: '#c15f3c' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Insight cards */}
          <div className="grid gap-[10px]">
            {[
              { n: '1', text: '账号定位：同城专业型皮肤管理顾问，主打真实案例和避坑科普。' },
              { n: '2', text: '爆款结构：痛点开头 → 误区纠正 → 案例证明 → 私信引导。' },
              { n: '3', text: '内容节奏：每周 2 条案例、2 条科普、1 条转化型内容。' },
            ].map(item => (
              <div
                key={item.n}
                className="grid grid-cols-[24px_1fr] items-start gap-[10px] rounded-2xl border p-3 text-[13px] leading-[1.65]"
                style={{
                  background: 'rgba(255,255,255,0.42)',
                  borderColor: 'rgba(216,203,187,0.76)',
                  color: '#4d463d',
                }}
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-lg text-[11px] text-[#fbf8f1]"
                  style={{ ...monoFont, background: '#191714' }}
                >
                  {item.n}
                </span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Right: Form Card */}
        <section
          className="rounded-[28px] border p-7"
          style={{
            background: 'rgba(251,248,241,0.88)',
            borderColor: '#d8cbbb',
            boxShadow: '0 22px 70px rgba(45,35,24,0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Form header */}
          <div
            className="mb-7 flex items-start justify-between gap-5 border-b pb-[22px]"
            style={{ borderColor: '#d8cbbb' }}
          >
            <div>
              <div
                className="mb-[10px] text-xs uppercase tracking-[0.08em]"
                style={{ ...monoFont, color: '#8f3f25' }}
              >
                input context
              </div>
              <h2
                className="mb-[10px] text-[32px] font-extrabold"
                style={{ letterSpacing: '-0.055em' }}
              >
                先描述你的门店
              </h2>
              <div
                className="max-w-[540px] text-sm leading-[1.8]"
                style={{ color: '#6f675c' }}
              >
                只收集会影响策略判断的信息。系统会根据行业、城市、客群和优势，生成搜索词、筛选对标账号，并进入内容拆解流程。
              </div>
            </div>
            <div
              className="shrink-0 whitespace-nowrap rounded-full border px-3 py-[9px] text-xs"
              style={{
                ...monoFont,
                borderColor: '#b9aa99',
                color: '#6f675c',
                background: '#f7f1e7',
              }}
            >
              Step {currentStep + 1} / 5
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* ---- Section 1: 基础信息 ---- */}
            <div className="mb-[30px]">
              <SectionTitle title="基础信息" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="行业 *">
                  <select
                    value={form.industry}
                    onChange={e => update('industry', e.target.value)}
                    required
                    style={inputStyle}
                  >
                    <option value="">选择行业</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </Field>
                <Field label="城市 *">
                  <input
                    value={form.city}
                    onChange={e => update('city', e.target.value)}
                    placeholder="如：杭州"
                    required
                    style={inputStyle}
                  />
                </Field>
                <Field label="区域">
                  <input
                    value={form.district ?? ''}
                    onChange={e => update('district', e.target.value)}
                    placeholder="如：西湖区"
                    style={inputStyle}
                  />
                </Field>
                <Field label="门店名称 *">
                  <input
                    value={form.storeName}
                    onChange={e => update('storeName', e.target.value)}
                    placeholder="你的门店名"
                    required
                    style={inputStyle}
                  />
                </Field>
              </div>
            </div>

            {/* ---- Section 2: 经营定位 ---- */}
            <div className="mb-[30px]">
              <SectionTitle title="经营定位" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="客单价">
                  <select
                    value={form.priceRange}
                    onChange={e => update('priceRange', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">选择客单价</option>
                    {PRICE_RANGES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="目标受众">
                  <input
                    value={form.targetAudience}
                    onChange={e => update('targetAudience', e.target.value)}
                    placeholder="如：25-35 岁都市女性"
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div className="mt-4">
                <Field label="经营范围">
                  <textarea
                    value={form.businessArea}
                    onChange={e => update('businessArea', e.target.value)}
                    placeholder="你的主要业务和服务，例如：皮肤管理、抗衰、痘肌修复、面部清洁等"
                    style={textareaStyle}
                  />
                </Field>
              </div>
            </div>

            {/* ---- Section 3: 优势与素材 ---- */}
            <div className="mb-[30px]">
              <SectionTitle title="优势与素材" />
              <Field label="特色项目">
                <div className="flex flex-wrap gap-[10px]">
                  {SPECIALTY_OPTIONS.map(item => (
                    <button
                      type="button"
                      key={item}
                      onClick={() => toggleSpecialty(item)}
                      className="cursor-pointer select-none rounded-full border px-[14px] py-[10px] text-[13px] transition-all duration-150"
                      style={{
                        borderColor: form.specialties.includes(item) ? '#191714' : '#d8cbbb',
                        background: form.specialties.includes(item) ? '#191714' : 'rgba(255,255,255,0.48)',
                        color: form.specialties.includes(item) ? '#fbf8f1' : '#4d463d',
                        boxShadow: form.specialties.includes(item) ? '4px 4px 0 rgba(25,23,20,0.14)' : 'none',
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </Field>

              {/* Tag inputs for realAdvantages and filmableAssets */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <TagInput
                  label="真实优势"
                  value={form.realAdvantages}
                  onChange={v => update('realAdvantages', v)}
                  placeholder="如：5年经验、复购率高"
                  inputStyle={inputStyle}
                />
                <TagInput
                  label="可拍摄素材"
                  value={form.filmableAssets}
                  onChange={v => update('filmableAssets', v)}
                  placeholder="如：门店环境、客户案例"
                  inputStyle={inputStyle}
                />
              </div>
            </div>

            {/* ---- Section 4: 内容偏好 ---- */}
            <div className="mb-[30px]">
              <SectionTitle title="内容偏好" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="是否愿意出镜">
                  <select
                    value={
                      form.onCamera === true ? '愿意出镜'
                        : form.onCamera === false && form.onCameraInfo !== undefined ? '不愿意出镜'
                        : ''
                    }
                    onChange={e => {
                      const val = e.target.value
                      update('onCamera', val === '愿意出镜')
                    }}
                    style={inputStyle}
                  >
                    <option value="">请选择</option>
                    {ON_CAMERA_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="更新频率">
                  <select
                    value={form.postFrequency}
                    onChange={e => update('postFrequency', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">选择频率</option>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field label="现有账号">
                  <input
                    value={form.existingAccount ?? ''}
                    onChange={e => update('existingAccount', e.target.value)}
                    placeholder="小红书号或链接"
                    style={inputStyle}
                  />
                </Field>
                <Field label="转化方式">
                  <select
                    value={form.conversionMethod}
                    onChange={e => update('conversionMethod', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">选择方式</option>
                    {CONVERSION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4">
                <TagInput
                  label="禁忌话题"
                  value={form.forbiddenTopics ?? []}
                  onChange={v => update('forbiddenTopics', v)}
                  placeholder="如：价格对比，按回车添加"
                  inputStyle={inputStyle}
                />
              </div>
            </div>

            {/* ---- Section 5: 分析模式 ---- */}
            <div className="mb-8">
              <SectionTitle title="分析模式" />
              <div className="grid grid-cols-2 gap-4">
                {/* Fast mode */}
                <button
                  type="button"
                  onClick={() => setMode('fast')}
                  className="relative min-h-[132px] cursor-pointer rounded-[20px] border p-[18px] text-left transition-all duration-150"
                  style={{
                    borderColor: mode === 'fast' ? '#191714' : '#d8cbbb',
                    background: mode === 'fast' ? '#191714' : 'rgba(255,255,255,0.42)',
                    color: mode === 'fast' ? '#fbf8f1' : '#191714',
                    boxShadow: mode === 'fast' ? '7px 7px 0 rgba(25,23,20,0.14)' : 'none',
                  }}
                >
                  <div className="text-[17px] font-extrabold" style={{ letterSpacing: '-0.035em' }}>
                    快速模式
                  </div>
                  <div
                    className="mt-[10px] max-w-[280px] text-[13px] leading-[1.75]"
                    style={{ color: mode === 'fast' ? '#cbbfb0' : '#6f675c' }}
                  >
                    约 8 分钟，分析 3 个对标账号，生成 2 条脚本。适合快速验证方向。
                  </div>
                </button>

                {/* Deep mode */}
                <button
                  type="button"
                  onClick={() => setMode('deep')}
                  className="relative min-h-[132px] cursor-pointer rounded-[20px] border p-[18px] text-left transition-all duration-150"
                  style={{
                    borderColor: mode === 'deep' ? '#191714' : '#d8cbbb',
                    background: mode === 'deep' ? '#191714' : 'rgba(255,255,255,0.42)',
                    color: mode === 'deep' ? '#fbf8f1' : '#191714',
                    boxShadow: mode === 'deep' ? '7px 7px 0 rgba(25,23,20,0.14)' : 'none',
                  }}
                >
                  <span
                    className="absolute right-[14px] top-[14px] rounded-full px-2 py-[5px] text-[11px] text-[#fbf8f1]"
                    style={{
                      ...monoFont,
                      background: '#c15f3c',
                    }}
                  >
                    recommended
                  </span>
                  <div className="text-[17px] font-extrabold" style={{ letterSpacing: '-0.035em' }}>
                    深度模式
                  </div>
                  <div
                    className="mt-[10px] max-w-[280px] text-[13px] leading-[1.75]"
                    style={{ color: mode === 'deep' ? '#cbbfb0' : '#6f675c' }}
                  >
                    约 15 分钟，分析 5 个对标账号，生成 30 条选题和 3 条脚本。
                  </div>
                </button>
              </div>
            </div>

            {/* ---- Actions ---- */}
            <div className="grid grid-cols-[150px_1fr] items-center gap-[14px] pt-1">
              <button
                type="button"
                className="h-[58px] cursor-pointer rounded-2xl border text-[15px] font-bold transition-all duration-150 hover:-translate-y-[2px]"
                style={{
                  borderColor: '#b9aa99',
                  background: 'transparent',
                  color: '#6f675c',
                }}
                onClick={() => setForm(defaultProfile)}
              >
                保存草稿
              </button>
              <button
                type="submit"
                disabled={submitting || !form.industry || !form.city || !form.storeName}
                className="h-[58px] cursor-pointer rounded-2xl border text-[15px] font-bold transition-all duration-150 hover:-translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                style={{
                  borderColor: '#191714',
                  background: '#191714',
                  color: '#fbf8f1',
                  boxShadow: '6px 6px 0 rgba(25,23,20,0.16)',
                }}
              >
                {submitting ? '提交中...' : '运行对标分析 →'}
              </button>
            </div>
            <div
              className="mt-4 text-center text-xs"
              style={{ ...monoFont, color: '#6f675c' }}
            >
              local context only · 信息仅用于生成内容策略，不会公开展示
            </div>
          </form>
        </section>
      </section>
    </>
  )
}

// --- Section Title ---
function SectionTitle({ title }: { title: string }) {
  const monoFont: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  }
  return (
    <div
      className="mb-[14px] flex items-center gap-[10px] text-sm font-bold tracking-tight"
      style={monoFont}
    >
      <span
        className="inline-block h-[10px] w-[10px] rounded-[3px]"
        style={{ background: '#c15f3c', boxShadow: '3px 3px 0 rgba(193,95,60,0.18)' }}
      />
      {title}
    </div>
  )
}

// --- Field wrapper ---
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-[13px] font-bold text-[#28231e]">{label}</label>
      {children}
    </div>
  )
}

// --- Tag Input ---
function TagInput({ label, value, onChange, placeholder, inputStyle }: {
  label: string
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
  inputStyle: React.CSSProperties
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
      <label className="mb-2 block text-[13px] font-bold text-[#28231e]">{label}</label>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        style={inputStyle}
        placeholder={placeholder}
      />
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-[6px]">
          {value.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-[#4d463d]"
              style={{
                background: 'rgba(255,255,255,0.48)',
                borderColor: '#d8cbbb',
              }}
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="text-[#6f675c] hover:text-[#191714]"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
