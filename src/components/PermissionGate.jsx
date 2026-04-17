import { useRole } from '../context/RoleContext'

export default function PermissionGate({ permission, children, fallback = null }) {
  const { hasPermission } = useRole()
  return hasPermission(permission) ? children : fallback
}
