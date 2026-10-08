'use client'
import { useFormStatus } from 'react-dom'
export default function SubmitButton({ children, name, value, secondary = false }: { children: React.ReactNode; name?: string; value?: string; secondary?: boolean }) {
  const { pending } = useFormStatus()
  return <button type="submit" name={name} value={value} disabled={pending} aria-disabled={pending} className={secondary ? 'secondary-button' : 'button'}>{pending ? 'Recording…' : children}</button>
}
