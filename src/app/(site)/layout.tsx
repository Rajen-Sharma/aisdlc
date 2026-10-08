import './style.css'
export const metadata = { title: 'Content Studio | Headless CMS', description: 'A headless content workspace with a Drupal migration preview.' }
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
