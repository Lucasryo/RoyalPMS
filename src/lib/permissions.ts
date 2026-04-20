import { UserPermissions, UserProfile } from '../types';

/**
 * Retorna true se o perfil tem a permissão indicada.
 * - admin sempre tem tudo.
 * - Se `profile.permissions` existe, é a fonte da verdade.
 * - Caso contrário, cai no `fallbackRoles` (compatibilidade com usuários antigos sem permissions).
 */
export function hasPermission(
  profile: UserProfile | null | undefined,
  key: keyof UserPermissions,
  fallbackRoles: string[] = []
): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (profile.permissions && key in profile.permissions) {
    return !!profile.permissions[key];
  }
  return fallbackRoles.includes(profile.role);
}

/**
 * Helper específico para verificar se o usuário pode acessar uma "view" do app.
 * Cada view é associada a uma permissão (ou múltiplas com OR) + fallback por role.
 */
export function canAccessView(
  profile: UserProfile | null | undefined,
  view: string
): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;

  switch (view) {
    case 'dashboard':
      return hasPermission(profile, 'canViewDashboard', ['admin', 'reservations', 'client', 'faturamento', 'reception', 'finance', 'eventos']);
    case 'reservations':
      return hasPermission(profile, 'canViewReservations', ['admin', 'reservations', 'client']);
    case 'events':
      return hasPermission(profile, 'canViewEvents', ['admin', 'reservations', 'finance', 'eventos']);
    case 'guests':
      return hasPermission(profile, 'canViewGuests', ['admin', 'reservations']);
    case 'companies':
      return hasPermission(profile, 'canViewCompanies', ['admin', 'eventos']);
    case 'tracking':
      return hasPermission(profile, 'canViewTracking', ['admin', 'reservations', 'faturamento', 'finance', 'reception']);
    case 'finance':
      return hasPermission(profile, 'canViewFinance', ['admin', 'client', 'faturamento', 'finance', 'reservations']);
    case 'tariffs':
      return hasPermission(profile, 'canViewTariffs', ['admin', 'faturamento', 'reservations', 'finance']);
    case 'registration':
      return hasPermission(profile, 'canCreateUsers', ['admin', 'faturamento']);
    case 'staff':
      return hasPermission(profile, 'canViewStaff', ['admin']);
    case 'audit':
      return false;
    case 'profile':
      return true;
    default:
      return false;
  }
}
