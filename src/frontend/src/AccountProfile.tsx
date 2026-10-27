import { Field } from "@base-ui/react/field";
import { Check } from "lucide-react";
import { ActionStatus, PendingIcon } from "./ActionFeedback";
import { Avatar } from "./Avatar";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import type { AccountProfileController } from "./useAccountProfile";

export function AccountProfile({ user, displayName, role, workspaceName, profile }: {
  user: string; displayName: string | null; role: string; workspaceName: string;
  profile: AccountProfileController;
}) {
  const { draft, saved, feedback, validation, changed, pending, setDraft, save, checkSaved } = profile;
  return <section className="user-settings"><div className="settings-page account-profile-page">
    <header className="settings-page-heading"><p className="settings-kicker">ACCOUNT</p><h1>Profile</h1><p>Your name and workspace access.</p></header>
    <section className="settings-card account-profile-card" aria-label="Account profile">
      <header className="profile-identity"><Avatar name={displayName || user} /><div><h2>{displayName || user}</h2><Badge variant="secondary">{role === "owner" ? "Owner" : "Member"}</Badge></div></header>
      <form className="profile-form" noValidate onSubmit={e => {
        e.preventDefault();
        void save();
      }}>
        <Field.Root className="profile-name-field" invalid={!!validation} disabled={pending}>
          <Field.Label htmlFor="account-display-name">Display name</Field.Label>
          <Input id="account-display-name" name="display_name" placeholder={user} value={draft} disabled={pending}
            aria-invalid={!!validation} aria-describedby={validation ? "profile-name-help profile-name-error" : "profile-name-help"}
            onChange={e => setDraft(e.target.value)} />
          <Field.Description id="profile-name-help" className="hint">Up to 64 characters. Leave blank to use your username.</Field.Description>
          {validation && <p id="profile-name-error" className="field-error">{validation}</p>}
        </Field.Root>
        <div className="profile-save-row"><Button type="submit" disabled={pending || !changed || !!validation} aria-label="Save profile">
          <PendingIcon pending={pending} />{!pending && saved && <Check data-icon="inline-start" />}
          {pending ? "Saving…" : saved && !changed ? "Saved" : "Save profile"}
        </Button></div>
        <ActionStatus feedback={feedback}>{feedback.result?.kind === "error" && <Button variant="outline" type="button" disabled={pending} onClick={() => void checkSaved()}>Check saved profile</Button>}</ActionStatus>
      </form>
      <section className="profile-access" aria-labelledby="profile-access-heading"><h3 id="profile-access-heading">Account access</h3>
        <dl className="profile-details"><dt>Account</dt><dd>{user === "owner" ? "Platform administrator" : "Matrix account"}</dd><dt>Username</dt><dd>{user}</dd><dt>Workspace</dt><dd>{workspaceName}</dd><dt>Role</dt><dd>{role === "owner" ? "Owner" : "Member"}</dd></dl>
      </section>
    </section>
  </div></section>;
}
