'use client'
import { useState } from 'react'
import { StoreProfileForm } from '@/components/StoreProfileForm'
import { AgentTimeline } from '@/components/AgentTimeline'
import { ResultPanel } from '@/components/ResultPanel'
import type { StoreProfile, JobMode } from '@/lib/types'

type PageState = 'idle' | 'running' | 'completed' | 'error'

export default function Home() {
  const [state, setState] = useState<PageState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)

  const handleSubmit = async (profile: StoreProfile, mode: JobMode) => {
    try {
      // Send flat object matching the new Zod schema
      const body = { ...profile, mode }
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setJobId(data.id)
        setState('running')
      }
    } catch {
      // TODO: show error
    }
  }

  const reset = () => {
    setState('idle')
    setJobId(null)
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at 12% 8%, rgba(193, 95, 60, 0.13), transparent 28%), linear-gradient(180deg, #f7f1e8 0%, #eee4d6 100%)',
        color: '#191714',
      }}
    >
      {/* Grid overlay */}
      <div
        className="pointer-events-none fixed inset-0"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(rgba(25,23,20,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(25,23,20,0.035) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.62), transparent 78%)',
        }}
      />

      <div className="relative mx-auto max-w-[1220px] px-6 pb-18 pt-[34px]">
        {/* ---- Topbar ---- */}
        <header
          className="mb-14 flex items-center justify-between border-b pb-[18px]"
          style={{ borderColor: '#d8cbbb' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid h-[34px] w-[34px] place-items-center rounded-[10px] border bg-[#fbf8f1]"
              style={{
                borderColor: '#191714',
                boxShadow: '4px 4px 0 #191714',
              }}
            >
              <span className="text-base leading-none">&#x2726;</span>
            </div>
            <span
              className="text-sm font-bold tracking-tight"
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            >
              BENCHMARK.AGENT
            </span>
          </div>
          <nav
            className="flex gap-[22px] text-[13px]"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: '#6f675c',
            }}
          >
            <span>discover</span>
            <span>analyze</span>
            <span>script</span>
          </nav>
        </header>

        {/* ---- Page States ---- */}
        {state === 'idle' && (
          <>
            {/* ---- Hero ---- */}
            <section className="mb-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.02fr_0.98fr]">
              <div>
                {/* Eyebrow */}
                <div
                  className="mb-[22px] inline-flex items-center gap-2 rounded-full border px-3 py-2"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '13px',
                    color: '#8f3f25',
                    background: 'rgba(193,95,60,0.1)',
                    borderColor: 'rgba(193,95,60,0.24)',
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background: '#c15f3c',
                      boxShadow: '0 0 0 4px rgba(193,95,60,0.15)',
                    }}
                  />
                  Claude Code inspired · AI Agent 驱动
                </div>

                <h1
                  className="max-w-[680px] font-extrabold leading-[0.95]"
                  style={{
                    fontSize: 'clamp(46px, 6vw, 78px)',
                    letterSpacing: '-0.075em',
                  }}
                >
                  让 AI 像分析师一样，拆解同城
                  <span
                    className="font-medium italic"
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", "Songti SC", serif',
                      letterSpacing: '-0.055em',
                    }}
                  >
                    对标账号
                  </span>
                </h1>

                <p className="mt-6 max-w-[590px] text-[17px] leading-[1.85]" style={{ color: '#6f675c' }}>
                  输入门店信息，系统自动生成搜索任务，发现同城同行账号，拆解账号定位、爆款结构、内容栏目和转化路径，最后输出一套可直接拍的小红书内容方案。
                </p>

                <div className="mt-8 flex items-center gap-[14px]">
                  <div
                    className="inline-flex h-[46px] items-center gap-[10px] rounded-[14px] border px-4"
                    style={{
                      borderColor: '#b9aa99',
                      background: '#fbf8f1',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: '13px',
                      color: '#6f675c',
                    }}
                  >
                    <span
                      className="rounded-lg px-2 py-[5px] text-xs text-[#fff7ea]"
                      style={{ background: '#191714' }}
                    >
                      &#x2318;
                    </span>
                    先描述门店，再运行分析
                  </div>
                </div>
              </div>

              {/* Terminal mockup */}
              <aside
                className="overflow-hidden rounded-[28px] border"
                style={{
                  background: '#181512',
                  color: '#f6ecdc',
                  border: '1px solid rgba(25,23,20,0.65)',
                  boxShadow:
                    '0 22px 70px rgba(45,35,24,0.12), 0 0 0 1px rgba(255,255,255,0.05) inset',
                  transform: 'rotate(1deg)',
                }}
              >
                <div
                  className="flex h-[46px] items-center justify-between border-b px-[18px]"
                  style={{
                    background: '#211d18',
                    borderColor: 'rgba(255,255,255,0.08)',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '12px',
                    color: '#a99f91',
                  }}
                >
                  <div className="flex gap-[7px]">
                    <span className="inline-block h-[11px] w-[11px] rounded-full" style={{ background: '#6b6257' }} />
                    <span className="inline-block h-[11px] w-[11px] rounded-full" style={{ background: '#6b6257' }} />
                    <span className="inline-block h-[11px] w-[11px] rounded-full" style={{ background: '#6b6257' }} />
                  </div>
                  <span>xhs-benchmark-agent</span>
                </div>
                <div
                  className="p-6"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: '13px',
                    lineHeight: '1.7',
                  }}
                >
                  <div>
                    <span style={{ color: '#78d48b' }}>$ </span>
                    <span style={{ color: '#fff7ea' }}>run benchmark --city 杭州 --industry 美业</span>
                  </div>
                  <div style={{ color: '#8f8678' }}>Generating search intents...</div>
                  <div style={{ color: '#8f8678' }}>Scanning local creator patterns...</div>
                  <div>
                    <span style={{ color: '#f29b72' }}>&#x2713; </span>
                    <span style={{ color: '#f6ecdc' }}>matched 5 competitor accounts</span>
                  </div>

                  <div
                    className="mt-[18px] rounded-[18px] border p-4"
                    style={{
                      background: '#241f1a',
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="mb-1" style={{ color: '#8f8678' }}>Expected output</div>
                    <div className="grid grid-cols-3 gap-[10px]">
                      {[
                        ['5', '对标账号'],
                        ['30', '选题方向'],
                        ['3', '脚本模板'],
                      ].map(([val, label]) => (
                        <div
                          key={label}
                          className="rounded-[14px] border p-3"
                          style={{
                            background: 'rgba(255,255,255,0.045)',
                            borderColor: 'rgba(255,255,255,0.07)',
                          }}
                        >
                          <strong className="block text-[21px] text-[#fff7ea]">{val}</strong>
                          <span className="text-xs" style={{ color: '#998f80' }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>
            </section>
          </>
        )}

        {/* ---- Form / Timeline / Result ---- */}
        {state === 'idle' && (
          <StoreProfileForm onSubmit={handleSubmit} />
        )}
        {state === 'running' && jobId && (
          <AgentTimeline
            jobId={jobId}
            onComplete={() => setState('completed')}
            onError={() => setState('error')}
            onNewTask={reset}
          />
        )}
        {(state === 'completed' || state === 'error') && jobId && (
          <ResultPanel jobId={jobId} onNewTask={reset} />
        )}
      </div>
    </div>
  )
}
