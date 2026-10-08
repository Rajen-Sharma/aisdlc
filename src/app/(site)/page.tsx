import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
export const dynamic = 'force-dynamic'
export default async function Home() {
  const payload = await getPayload({ config })
  const result = await payload.find({ collection: 'articles', overrideAccess: false, user: null, depth: 0, limit: 20, sort: '-updatedAt' })
  return <main>
    <header><Link href="/" className="brand"><span className="mark">C</span> Content Studio</Link><nav><a href="#content">Content</a><Link href="/admin" className="button small">Open workspace ↗</Link></nav></header>
    <section className="hero"><span className="eyebrow">A NEW HOME FOR YOUR CONTENT</span><h1>Good content.<br/><span>Ready for anywhere.</span></h1><p>Create, review, and publish in one workspace. Bring your existing content along with a clear, repeatable migration path.</p><div className="actions"><Link className="button" href="/admin">Enter the studio ↗</Link><a className="text-link" href="#content">Explore published content ↓</a></div><div className="badge"><span/> Local MVP · Synthetic Drupal sample</div></section>
    <section className="overview"><div><span className="number">{result.totalDocs.toString().padStart(2, '0')}</span><p>Public articles</p></div><div><span className="number">01</span><p>Connected sample source</p></div><div><span className="number">Draft → Live</span><p>A considered publishing workflow</p></div></section>
    <section id="content" className="content"><div className="section-heading"><div><span className="eyebrow">THE PUBLIC COLLECTION</span><h2>Fresh from the studio</h2></div><a href="/api/articles" className="text-link">View delivery API ↗</a></div><div className="grid">{result.docs.length ? result.docs.map(doc => <article className="card" key={doc.id}><div className="card-top"><span className="pill">Published</span><span>Article</span></div><h3>{String(doc.title)}</h3><p>{String(doc.body)}</p><footer>Updated {new Date(String(doc.updatedAt)).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })}<span>↗</span></footer></article>) : <div className="empty"><h3>Your collection starts here</h3><p>Import the synthetic sample or publish your first public article in the studio.</p></div>}</div></section>
    <section className="workflow"><span className="eyebrow">FROM EXISTING CONTENT TO NEW POSSIBILITIES</span><h2>A migration you can follow.</h2><div className="steps"><div><b>01 / Bring it in</b><p>Start with a synthetic Drupal sample and preserve where each record came from.</p></div><div><b>02 / Make it yours</b><p>Edit drafts in the workspace. Publisher permissions keep release decisions deliberate.</p></div><div><b>03 / Share it safely</b><p>Only public, published articles appear here. Drafts stay inside the workspace.</p></div></div></section>
    <footer className="site-footer"><span>Content Studio · MVP 1</span><span>Built for review. Production readiness pending.</span></footer>
  </main>
}
