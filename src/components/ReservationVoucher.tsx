import React from 'react';
import { Reservation, Company } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Printer } from 'lucide-react';

interface ReservationVoucherProps {
  reservation: Reservation;
  company?: Company;
  onClose: () => void;
}

export default function ReservationVoucher({ reservation, company, onClose }: ReservationVoucherProps) {
  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header - Não imprime */}
        <div className="flex items-center justify-between p-4 border-b print:hidden">
          <h2 className="text-xl font-semibold">Voucher de Reserva</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo do Voucher - Para impressão */}
        <div className="p-8 print:p-12">
          {/* Cabeçalho do Hotel */}
          <div className="text-center mb-8 border-b-2 border-gray-800 pb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Hotel Royal Macaé</h1>
            <p className="text-gray-600">Rua Exemplo, 123 - Centro - Macaé/RJ</p>
            <p className="text-gray-600">Tel: (22) 1234-5678 | Email: contato@hotelroyal.com.br</p>
          </div>

          {/* Título do Voucher */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">VOUCHER DE RESERVA</h2>
            <p className="text-lg text-gray-600">Código: {reservation.reservation_code}</p>
          </div>

          {/* Informações da Empresa */}
          {company && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-800 mb-2">Empresa Responsável</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Nome:</span>
                  <p className="font-medium">{company.name}</p>
                </div>
                {company.cnpj && (
                  <div>
                    <span className="text-gray-600">CNPJ:</span>
                    <p className="font-medium">{company.cnpj}</p>
                  </div>
                )}
                {company.phone && (
                  <div>
                    <span className="text-gray-600">Telefone:</span>
                    <p className="font-medium">{company.phone}</p>
                  </div>
                )}
                {company.email && (
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <p className="font-medium">{company.email}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Informações do Hóspede */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3 text-lg border-b pb-2">Dados do Hóspede</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-600 text-sm">Nome do Hóspede:</span>
                <p className="font-medium text-lg">{reservation.guest_name}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Telefone de Contato:</span>
                <p className="font-medium">{reservation.contact_phone}</p>
              </div>
            </div>
          </div>

          {/* Informações da Reserva */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3 text-lg border-b pb-2">Detalhes da Reserva</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-600 text-sm">Check-in:</span>
                <p className="font-medium text-lg">{formatDate(reservation.check_in)}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Check-out:</span>
                <p className="font-medium text-lg">{formatDate(reservation.check_out)}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Categoria:</span>
                <p className="font-medium">{reservation.category}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Número de Hóspedes:</span>
                <p className="font-medium">{reservation.guests_per_uh}</p>
              </div>
              {reservation.room_number && (
                <div>
                  <span className="text-gray-600 text-sm">Quarto:</span>
                  <p className="font-medium">{reservation.room_number}</p>
                </div>
              )}
              <div>
                <span className="text-gray-600 text-sm">Status:</span>
                <p className="font-medium">
                  {reservation.status === 'CONFIRMED' && 'Confirmada'}
                  {reservation.status === 'PENDING' && 'Pendente'}
                  {reservation.status === 'CHECKED_IN' && 'Check-in Realizado'}
                  {reservation.status === 'CHECKED_OUT' && 'Check-out Realizado'}
                  {reservation.status === 'CANCELLED' && 'Cancelada'}
                </p>
              </div>
            </div>
          </div>

          {/* Informações Financeiras */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-3 text-lg border-b pb-2">Informações Financeiras</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-600 text-sm">Tarifa Diária:</span>
                <p className="font-medium">{formatCurrency(reservation.tariff)}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Valor Total:</span>
                <p className="font-bold text-lg text-gray-900">{formatCurrency(reservation.total_amount)}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">ISS:</span>
                <p className="font-medium">{formatCurrency(reservation.iss_tax)}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Taxa de Serviço:</span>
                <p className="font-medium">{formatCurrency(reservation.service_tax)}</p>
              </div>
              <div>
                <span className="text-gray-600 text-sm">Forma de Pagamento:</span>
                <p className="font-medium">
                  {reservation.payment_method === 'BILLED' ? 'Faturado' : 'Cartão Virtual'}
                </p>
              </div>
              {reservation.cost_center && (
                <div>
                  <span className="text-gray-600 text-sm">Centro de Custo:</span>
                  <p className="font-medium">{reservation.cost_center}</p>
                </div>
              )}
            </div>
          </div>

          {/* Observações */}
          {reservation.billing_obs && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-800 mb-2">Observações:</h3>
              <p className="text-gray-700 bg-gray-50 p-3 rounded">{reservation.billing_obs}</p>
            </div>
          )}

          {/* Informações Adicionais */}
          <div className="mb-8 p-4 bg-gray-100 rounded-lg border border-gray-300">
            <h3 className="font-semibold text-gray-800 mb-2">Informações Importantes</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Check-in a partir das 14h00</li>
              <li>• Check-out até às 12h00</li>
              <li>• Apresentar documento de identificação no check-in</li>
              <li>• Este voucher deve ser apresentado na recepção</li>
              <li>• Em caso de cancelamento, consultar política de cancelamento</li>
            </ul>
          </div>

          {/* Rodapé */}
          <div className="border-t-2 border-gray-800 pt-6 mt-8">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 mt-12">
                  <p className="text-sm text-gray-600">Assinatura do Hóspede</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 mt-12">
                  <p className="text-sm text-gray-600">Assinatura do Hotel</p>
                </div>
              </div>
            </div>
            <div className="text-center mt-8 text-xs text-gray-500">
              <p>Emitido em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
              <p className="mt-1">Hotel Royal Macaé - Todos os direitos reservados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed.inset-0 {
            position: static;
          }
          .fixed.inset-0, .fixed.inset-0 * {
            visibility: visible;
            color: black !important;
            background-color: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
          .bg-white, .bg-gray-50, .bg-gray-100 {
            box-shadow: none !important;
            background-color: white !important;
            border: 1px solid #999 !important;
          }
          .text-gray-600, .text-gray-500, .text-gray-700 {
            color: #333 !important;
          }
          .border-gray-800, .border-b-2 {
            border-color: black !important;
          }
          @page {
            margin: 1.5cm;
            size: A4 portrait;
          }
        }
      `}</style>
    </div>
  );
}
