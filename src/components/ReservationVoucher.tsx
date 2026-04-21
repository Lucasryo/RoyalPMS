import { Reservation, Company } from '../types';
import { format, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X as CloseIcon, Printer, FileText } from 'lucide-react';
import { motion } from 'motion/react';

interface ReservationVoucherProps {
  reservation: Reservation;
  company?: Company;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  executivo: 'Executivo',
  master: 'Master',
  'suite presidencial': 'Suíte Presidencial',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Check-in Realizado',
  CHECKED_OUT: 'Check-out Realizado',
  CANCELLED: 'Cancelada',
};

const formatBRL = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const normalizeCategory = (c: string) =>
  (c || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export default function ReservationVoucher({ reservation, company, onClose }: ReservationVoucherProps) {
  const handlePrint = () => window.print();

  const nights = Math.max(
    1,
    differenceInCalendarDays(new Date(reservation.check_out), new Date(reservation.check_in))
  );

  const catKey = normalizeCategory(reservation.category || '');
  const subtotal = nights * Number(reservation.tariff || 0);
  const iss = Number(reservation.iss_tax || 0);
  const service = Number(reservation.service_tax || 0);
  const total = Number(reservation.total_amount || subtotal + iss + service);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm nota-modal-backdrop">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            width: 210mm !important;
            height: auto !important;
            overflow: visible !important;
          }
          body * { visibility: hidden !important; }
          .nota-modal-backdrop, .nota-modal-backdrop * {
            transform: none !important;
            animation: none !important;
            transition: none !important;
            filter: none !important;
            backdrop-filter: none !important;
            overflow: visible !important;
            max-height: none !important;
            height: auto !important;
            box-shadow: none !important;
          }
          .nota-modal-backdrop {
            position: static !important;
            inset: auto !important;
            background: #fff !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }
          .nota-printable, .nota-printable * { visibility: visible !important; }
          .nota-printable {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            right: auto !important;
            bottom: auto !important;
            width: 210mm !important;
            max-width: 210mm !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 15mm 14mm !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
            background: #fff !important;
          }
          .nota-no-print { display: none !important; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-3xl max-h-[92vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-4 border-b border-neutral-100 flex justify-between items-center nota-no-print">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-neutral-900" />
            <h3 className="text-sm font-bold text-neutral-900">Voucher de Reserva</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white text-xs font-bold rounded-lg hover:bg-neutral-800"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir / Salvar PDF
            </button>
            <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full">
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-neutral-100">
          <div
            className="nota-printable bg-white mx-auto my-6 shadow-sm"
            style={{
              width: '210mm',
              minHeight: '297mm',
              padding: '18mm 16mm',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#111',
            }}
          >
            <div className="flex justify-between items-start pb-4 border-b-2 border-neutral-900">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-amber-600">Hotel Royal Macaé</h1>
                <p className="text-[10px] text-neutral-600 mt-1 leading-snug">
                  Rua Dom José Pereira Alves, 170 · Centro · Macaé/RJ<br />
                  CNPJ: 00.000.000/0001-00 · (22) 0000-0000 · contato@hotelroyalmacae.com.br
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Documento</p>
                <p className="text-lg font-black text-neutral-900">Voucher de Reserva</p>
                <p className="text-[10px] text-neutral-600 mt-1">
                  Nº {reservation.reservation_code || reservation.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-[10px] text-neutral-500">
                  Emitido em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>

            {company && (
              <div className="mt-5">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Empresa Responsável</h2>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-xs">
                  <div className="flex">
                    <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Razão Social</span>
                    <span className="font-bold text-neutral-900">{company.name}</span>
                  </div>
                  {company.cnpj && (
                    <div className="flex">
                      <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">CNPJ</span>
                      <span className="text-neutral-900">{company.cnpj}</span>
                    </div>
                  )}
                  {company.phone && (
                    <div className="flex">
                      <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Telefone</span>
                      <span className="text-neutral-900">{company.phone}</span>
                    </div>
                  )}
                  {company.email && (
                    <div className="flex">
                      <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">E-mail</span>
                      <span className="text-neutral-900">{company.email}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Dados do Hóspede</h2>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-xs">
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Hóspede</span>
                  <span className="font-bold text-neutral-900">{reservation.guest_name}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Telefone</span>
                  <span className="text-neutral-900">{reservation.contact_phone || '—'}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Hóspedes</span>
                  <span className="text-neutral-900">{reservation.guests_per_uh}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Status</span>
                  <span className="text-neutral-900">{STATUS_LABELS[reservation.status] || reservation.status}</span>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Detalhes da Reserva</h2>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-xs">
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Entrada</span>
                  <span className="font-bold text-neutral-900">
                    {format(new Date(reservation.check_in), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Saída</span>
                  <span className="font-bold text-neutral-900">
                    {format(new Date(reservation.check_out), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Diárias</span>
                  <span className="text-neutral-900">{nights}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Categoria</span>
                  <span className="text-neutral-900">{CATEGORY_LABELS[catKey] || reservation.category || '—'}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Apto / UH</span>
                  <span className="font-bold text-neutral-900">{reservation.room_number || '—'}</span>
                </div>
                <div className="flex">
                  <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">Pagamento</span>
                  <span className="text-neutral-900">
                    {reservation.payment_method === 'VIRTUAL_CARD' ? 'Cartão Virtual' : 'Faturado'}
                  </span>
                </div>
                {reservation.cost_center && (
                  <div className="flex">
                    <span className="w-28 text-neutral-500 font-bold uppercase text-[9px] tracking-widest">C. de Custo</span>
                    <span className="text-neutral-900">{reservation.cost_center}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Informações Financeiras</h2>
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="bg-neutral-900 text-white">
                    <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Descrição</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Qtd</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Unit.</th>
                    <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                    <td className="px-2 py-1.5">Diárias · {CATEGORY_LABELS[catKey] || reservation.category || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{nights}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(reservation.tariff)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-bold">{formatBRL(subtotal)}</td>
                  </tr>
                  {iss > 0 && (
                    <tr style={{ borderBottom: '1px solid #e5e5e5', backgroundColor: '#fafafa' }}>
                      <td className="px-2 py-1.5" colSpan={3}>ISS</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(iss)}</td>
                    </tr>
                  )}
                  {service > 0 && (
                    <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                      <td className="px-2 py-1.5" colSpan={3}>Taxa de Serviço</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatBRL(service)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-72 border-t-2 border-neutral-900 pt-3">
                <div className="flex justify-between text-xs py-1">
                  <span className="text-neutral-600">Subtotal diárias</span>
                  <span className="tabular-nums font-bold">{formatBRL(subtotal)}</span>
                </div>
                {iss > 0 && (
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-neutral-600">ISS</span>
                    <span className="tabular-nums font-bold">{formatBRL(iss)}</span>
                  </div>
                )}
                {service > 0 && (
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-neutral-600">Taxa de serviço</span>
                    <span className="tabular-nums font-bold">{formatBRL(service)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 mt-1 border-t border-neutral-300">
                  <span className="text-sm font-bold uppercase tracking-widest">Total Geral</span>
                  <span className="text-xl font-black tabular-nums text-neutral-900">{formatBRL(total)}</span>
                </div>
              </div>
            </div>

            {reservation.billing_obs && (
              <div className="mt-6 pt-3 border-t border-neutral-200">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Observações</h3>
                <p className="text-[11px] text-neutral-700 whitespace-pre-line">{reservation.billing_obs}</p>
              </div>
            )}

            <div className="mt-6 p-3 bg-neutral-50 border border-neutral-200 rounded">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Informações Importantes</h3>
              <ul className="text-[10px] text-neutral-700 space-y-0.5">
                <li>• Check-in a partir das 14h00</li>
                <li>• Check-out até às 12h00</li>
                <li>• Apresentar documento de identificação na recepção</li>
                <li>• Este voucher deve ser apresentado no check-in</li>
                <li>• Em caso de cancelamento, consultar política contratada</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-12 mt-14">
              <div>
                <div className="border-t border-neutral-900 pt-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Assinatura do Hóspede</p>
                  <p className="text-[10px] text-neutral-600 mt-0.5">{reservation.guest_name}</p>
                </div>
              </div>
              <div>
                <div className="border-t border-neutral-900 pt-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">Recepção</p>
                  <p className="text-[10px] text-neutral-600 mt-0.5">Hotel Royal Macaé</p>
                </div>
              </div>
            </div>

            <div className="mt-10 pt-3 border-t border-neutral-200 text-center">
              <p className="text-[9px] text-neutral-400 uppercase tracking-widest">
                Agradecemos a sua preferência · Hotel Royal Macaé
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-neutral-100 flex justify-end gap-3 bg-white nota-no-print">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold text-neutral-600"
          >
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-neutral-900/20"
          >
            <Printer className="w-4 h-4" />
            Imprimir Voucher
          </button>
        </div>
      </motion.div>
    </div>
  );
}
