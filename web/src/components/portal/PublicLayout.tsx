import { Outlet } from 'react-router-dom'
import PortalHeader from './PortalHeader'
import PortalFooter from './PortalFooter'

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PortalHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PortalFooter />
    </div>
  )
}
