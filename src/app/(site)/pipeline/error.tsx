'use client'
export default function ErrorView({ reset }: { reset: () => void }) {
  return <main><section className="hero"><span className="eyebrow">DELIVERY WORKSPACE</span><h1>This action needs attention.</h1><p>The request could not be completed. Your existing records are preserved. Check your sign-in, required fields and whether this result already has a review decision.</p><button className="button" onClick={reset}>Return to the workspace</button></section></main>
}
