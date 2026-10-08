import './style.css'
export const metadata = { title: 'Delivery Studio | AI SDLC', description: 'A project-independent AI software delivery workspace with human review and traceable evidence.' }
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
