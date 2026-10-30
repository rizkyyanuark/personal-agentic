import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { WorkspaceGate } from './WorkspaceGate'
import { JoinInvitation } from './MatrixInvitations'
import StandaloneOffice from './StandaloneOffice'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname === "/join" ? (
      <JoinInvitation />
    ) : location.pathname === "/office" ? (
      <StandaloneOffice />
    ) : (
      <WorkspaceGate />
    )}
  </StrictMode>,
)
