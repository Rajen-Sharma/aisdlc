import type { User } from '../../../payload-types'
import { approvedTaskScope } from '../../../sdlc/approved-task-registration'
import { registerRecordedTask } from './actions'
import SubmitButton from './SubmitButton'

export default function ApprovedTaskRegistration({ user, projectKey }: { user: User; projectKey: string }) {
  if (projectKey !== 'software-project') return null
  return <section className="delivery-panel runs-panel"><span className="eyebrow">YOUR RECORDED DECISION</span>
    <h2>Register the approved first task</h2>
    <p>Taskboard filter, version 1: your sprint scope and security design decision was recorded on 18 October. Registration attaches that decision to your signed-in account and preserves the exact contract.</p>
    <details><summary>Approved scope</summary><p>Filter todo, doing and done tasks. Preserve input, item identity and order; reject unsupported statuses.</p><p className="hash">Scope SHA-256 {approvedTaskScope}</p></details>
    <form action={registerRecordedTask}><input type="hidden" name="scopeHash" value={approvedTaskScope}/><SubmitButton>Register my recorded decision</SubmitButton></form>
    <p className="muted">Registration does not start AI coding. Runtime readiness and later code and outcome reviews remain required.</p>
  </section>
}
