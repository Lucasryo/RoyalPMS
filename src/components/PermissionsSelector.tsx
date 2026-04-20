import React from 'react';
import { UserPermissions } from '../types';
import { Check } from 'lucide-react';

interface PermissionsSelectorProps {
  permissions: UserPermissions;
  onChange: (permissions: UserPermissions) => void;
  role: string;
}

const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  admin: {
    canViewDashboard: true,
    canViewReservations: true,
    canCreateReservations: true,
    canEditReservations: true,
    canCancelReservations: true,
    canPrintVouchers: true,
    canViewEvents: true,
    canCreateEvents: true,
    canEditEvents: true,
    canCancelEvents: true,
    canViewGuests: true,
    canViewCompanies: true,
    canCreateCompanies: true,
    canViewFinance: true,
    canUploadFiles: true,
    canDownloadFiles: true,
    canViewStaff: true,
    canCreateUsers: true,
    canViewTariffs: true,
    canEditTariffs: true,
    canViewTracking: true,
    canViewBankAccounts: true,
  },
  reservations: {
    canViewDashboard: true,
    canViewReservations: true,
    canCreateReservations: true,
    canEditReservations: true,
    canCancelReservations: false,
    canPrintVouchers: true,
    canViewEvents: true,
    canCreateEvents: false,
    canEditEvents: false,
    canCancelEvents: false,
    canViewGuests: true,
    canViewCompanies: true,
    canCreateCompanies: false,
    canViewFinance: false,
    canUploadFiles: false,
    canDownloadFiles: false,
    canViewStaff: false,
    canCreateUsers: false,
    canViewTariffs: true,
    canEditTariffs: false,
    canViewTracking: false,
    canViewBankAccounts: false,
  },
  client: {
    canViewDashboard: true,
    canViewReservations: true,
    canCreateReservations: true,
    canEditReservations: false,
    canCancelReservations: false,
    canPrintVouchers: true,
    canViewEvents: false,
    canCreateEvents: false,
    canEditEvents: false,
    canCancelEvents: false,
    canViewGuests: false,
    canViewCompanies: false,
    canCreateCompanies: false,
    canViewFinance: true,
    canUploadFiles: false,
    canDownloadFiles: true,
    canViewStaff: false,
    canCreateUsers: false,
    canViewTariffs: false,
    canEditTariffs: false,
    canViewTracking: false,
    canViewBankAccounts: false,
  },
};

export default function PermissionsSelector({ permissions, onChange, role }: PermissionsSelectorProps) {
  if (!permissions) return <div className="text-xs text-neutral-400 py-2">Carregando permissões...</div>;

  const handleToggle = (key: keyof UserPermissions) => {
    onChange({
      ...permissions,
      [key]: !permissions[key],
    });
  };

  const handleLoadDefaults = () => {
    onChange(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.client);
  };

  const permissionGroups = [
    {
      title: 'Dashboard',
      permissions: [
        { key: 'canViewDashboard' as keyof UserPermissions, label: 'Visualizar Dashboard' },
      ],
    },
    {
      title: 'Reservas',
      permissions: [
        { key: 'canViewReservations' as keyof UserPermissions, label: 'Visualizar Reservas' },
        { key: 'canCreateReservations' as keyof UserPermissions, label: 'Criar Reservas' },
        { key: 'canEditReservations' as keyof UserPermissions, label: 'Editar Reservas' },
        { key: 'canCancelReservations' as keyof UserPermissions, label: 'Cancelar Reservas' },
        { key: 'canPrintVouchers' as keyof UserPermissions, label: 'Imprimir Vouchers' },
      ],
    },
    {
      title: 'Eventos',
      permissions: [
        { key: 'canViewEvents' as keyof UserPermissions, label: 'Visualizar Eventos' },
        { key: 'canCreateEvents' as keyof UserPermissions, label: 'Criar Eventos' },
        { key: 'canEditEvents' as keyof UserPermissions, label: 'Editar Eventos' },
        { key: 'canCancelEvents' as keyof UserPermissions, label: 'Cancelar Eventos' },
      ],
    },
    {
      title: 'Hóspedes e Empresas',
      permissions: [
        { key: 'canViewGuests' as keyof UserPermissions, label: 'Visualizar Hóspedes' },
        { key: 'canViewCompanies' as keyof UserPermissions, label: 'Visualizar Empresas' },
        { key: 'canCreateCompanies' as keyof UserPermissions, label: 'Criar Empresas' },
      ],
    },
    {
      title: 'Financeiro',
      permissions: [
        { key: 'canViewFinance' as keyof UserPermissions, label: 'Visualizar Financeiro' },
        { key: 'canUploadFiles' as keyof UserPermissions, label: 'Enviar Arquivos' },
        { key: 'canDownloadFiles' as keyof UserPermissions, label: 'Baixar Arquivos' },
        { key: 'canViewBankAccounts' as keyof UserPermissions, label: 'Ver Contas Bancárias' },
      ],
    },
    {
      title: 'Tarifas e Rastreamento',
      permissions: [
        { key: 'canViewTariffs' as keyof UserPermissions, label: 'Visualizar Tarifas' },
        { key: 'canEditTariffs' as keyof UserPermissions, label: 'Editar Tarifas' },
        { key: 'canViewTracking' as keyof UserPermissions, label: 'Visualizar Rastreamento' },
      ],
    },
    {
      title: 'Administração',
      permissions: [
        { key: 'canViewStaff' as keyof UserPermissions, label: 'Visualizar Funcionários' },
        { key: 'canCreateUsers' as keyof UserPermissions, label: 'Criar Usuários' },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Permissões do Usuário</h3>
        <button
          type="button"
          onClick={handleLoadDefaults}
          className="text-xs text-blue-600 hover:text-blue-700 underline"
        >
          Carregar padrão para {role}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {permissionGroups.map((group) => (
          <div key={group.title} className="border border-gray-200 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-gray-600 mb-2">{group.title}</h4>
            <div className="space-y-2">
              {group.permissions.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      permissions[perm.key]
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300'
                    }`}
                    onClick={() => handleToggle(perm.key)}
                  >
                    {permissions[perm.key] && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <span className="text-sm text-gray-700">{perm.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DEFAULT_PERMISSIONS };
