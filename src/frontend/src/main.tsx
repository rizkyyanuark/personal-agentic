import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { WorkspaceGate } from './WorkspaceGate'
import { JoinInvitation } from './MatrixInvitations'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.pathname === "/join" ? <JoinInvitation /> : <WorkspaceGate />}
  </StrictMode>,
)
