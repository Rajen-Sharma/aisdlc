'use client'
import Link from 'next/link'
import { useState } from 'react'
import { stages, type Template } from '../../../sdlc/library'
import './guide.css'
export default function Guide({ templates }: { templates: Template[] }) {
  const [stageId, setStageId] = useState('discovery')
  const [templateId, setTemplateId] = useState('project-charter')
  const [mode, setMode] = useState<'blank' | 'example'>('blank')
  const [notice, setNotice] = useState('')
  const stage = stages.find(s => s.id === stageId)!
  const template = templates.find(t => t.id === templateId)!
  const content = mode === 'blank' ? template.content : template.example
  function selectStage(id: string) {
    setStageId(id); setTemplateId(templates.find(t => t.stage === id)!.id); setMode('blank'); setNotice('')
  }
  async function copy() {
    try { await navigator.clipboard.writeText(content); setNotice('Copied to clipboard.') }
    catch { setNotice('Clipboard unavailable. Select the template text to copy it.') }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `${template.id}${mode === 'example' ? '-example' : ''}.md`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Markdown download started.')
  }
  return <main className="sdlc">
    <header><Link href="/" className="brand"><span className="mark">D</span> Delivery Studio</Link><nav><Link href="/pipeline">Delivery workspace</Link><Link href="/admin" className="button small">Administration ↗</Link></nav></header>
    <section className="guide-hero"><span className="eyebrow">THE DELIVERY PLAYBOOK</span><h1>From idea to<br/><span>reviewed release.</span></h1><p>Explore how AI prepares the work, humans make decisions, and evidence follows every change.</p><div className="guide-chips"><span>10 lifecycle stages</span><span>{templates.length} reusable templates</span><span>Human approval gates</span></div><p className="guide-note">Interactive guide and template library. This view does not execute agents, run checks, or record approvals.</p></section>
    <section className="guide-workbench" aria-label="AI SDLC explorer">
      <aside className="stage-list"><span className="eyebrow">01 / SELECT A STAGE</span>{stages.map((s, i) => <button key={s.id} aria-pressed={s.id === stageId} onClick={() => selectStage(s.id)}><span className="stage-number">{String(i + 1).padStart(2, '0')}</span><span>{s.title}</span><span aria-hidden="true">{s.id === stageId ? '→' : '·'}</span></button>)}</aside>
      <div className="guide-detail"><section className="stage-detail"><div className="stage-title"><h2>{stage.title}</h2><span className="gate-label">{stage.gate}</span></div><div className="responsibilities"><div><b>AI prepares</b><p>{stage.ai}</p></div><div><b>Human decides</b><p>{stage.human}</p></div><div><b>Evidence retained</b><p>{stage.evidence}</p></div></div></section>
        <section className="template-workbench"><aside className="template-list"><span className="eyebrow">02 / CHOOSE A TEMPLATE</span>{templates.filter(t => t.stage === stageId).map(t => <button aria-pressed={t.id === templateId} key={t.id} onClick={() => { setTemplateId(t.id); setMode('blank'); setNotice('') }}><b>{t.title}</b><span>{t.description}</span></button>)}</aside>
          <div className="template-view"><div className="template-heading"><h3>{template.title}</h3><div className="template-tools"><button onClick={copy}>Copy</button><button onClick={download}>Download .md ↓</button></div></div><div className="template-tabs"><button aria-pressed={mode === 'blank'} onClick={() => { setMode('blank'); setNotice('') }}>Blank template</button><button aria-pressed={mode === 'example'} onClick={() => { setMode('example'); setNotice('') }}>Project example</button></div>{mode === 'example' && <p className="example-warning">Illustrative excerpt · not an executed result or approval record.</p>}<pre className="template-content" tabIndex={0}>{content}</pre><p className="copy-notice" aria-live="polite">{notice || 'Replace placeholders, assign an owner, and version the document before review.'}</p></div>
        </section>
      </div>
    </section>
    <section className="trace-strip"><span className="eyebrow">ONE TRACEABLE CHAIN</span><p>Requirement → Story → Design → Change → Check → Human review → Release → Operations</p><span>Passing checks and human acceptance are recorded separately. No response never means approval.</span></section>
    <footer className="site-footer"><span>AI drafts · Humans approve · Checks verify</span><span>Templates are maintained in docs/templates</span></footer>
  </main>
}
