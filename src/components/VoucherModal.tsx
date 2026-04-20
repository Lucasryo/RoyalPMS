import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Loader2, Landmark } from 'lucide-react';
import { motion } from 'motion/react';
import { Company, FiscalFile, BankAccount } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../supabase';

interface VoucherModalProps {
  company: Company;
  selectedFiles: FiscalFile[];
  onClose: () => void;
}

export default function VoucherModal({ company, selectedFiles, onClose }: VoucherModalProps) {
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [formData, setFormData] = useState({
    billingNumber: `FAT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 15 dias padrão
    bankName: 'BANCO DO BRASIL',
    bankAgency: '1234-5',
    bankAccount: '123456-7',
    pixKey: 'financeiro@royalmacaepalace.com.br',
    observations: 'Favor efetuar o pagamento até a data de vencimento informada. O não pagamento acarretará em juros e multa conforme contrato. Enviar comprovante para o e-mail acima.',
    emissor: 'FINANCEIRO ROYAL MACAÉ',
    emissorEmail: 'financeiro@royalmacaepalace.com.br',
    para: company.name,
    data: new Date().toLocaleDateString('pt-BR'),
  });

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  const fetchBankAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .order('bank_name', { ascending: true });
      
      if (error) throw error;
      const list = data || [];
      setBankAccounts(list);
      
      // Se houver uma conta padrão, seleciona ela
      const defaultAcc = list.find(acc => acc.is_default);
      if (defaultAcc) {
        setFormData(prev => ({
          ...prev,
          bankName: defaultAcc.bank_name,
          bankAgency: defaultAcc.agency,
          bankAccount: defaultAcc.account,
          pixKey: defaultAcc.pix_key
        }));
      } else if (list.length > 0) {
        // Se não houver padrão mas houver contas, seleciona a primeira
        const firstAcc = list[0];
        setFormData(prev => ({
          ...prev,
          bankName: firstAcc.bank_name,
          bankAgency: firstAcc.agency,
          bankAccount: firstAcc.account,
          pixKey: firstAcc.pix_key
        }));
      }
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
    } finally {
      setLoadingBanks(false);
    }
  };

  const handleBankSelect = (accountId: string) => {
    const selected = bankAccounts.find(acc => acc.id === accountId);
    if (selected) {
      setFormData({
        ...formData,
        bankName: selected.bank_name,
        bankAgency: selected.agency,
        bankAccount: selected.account,
        pixKey: selected.pix_key
      });
    }
  };

  // Estado para os valores individuais de cada fatura selecionada
  const [fileValues, setFileValues] = useState<Record<string, { guest: string, dailyRates: string, restaurant: string, minibar: string }>>(
    selectedFiles.reduce<Record<string, { guest: string, dailyRates: string, restaurant: string, minibar: string }>>((acc, file) => ({
      ...acc,
      [file.id]: { 
        guest: file.original_name.split('.')[0], 
        dailyRates: '0,00', 
        restaurant: '0,00',
        minibar: '0,00'
      }
    }), {})
  );

  const totalValue: number = (Object.values(fileValues) as { guest: string, dailyRates: string, restaurant: string, minibar: string }[]).reduce((sum: number, item) => {
    const d = parseFloat(item.dailyRates.replace(',', '.')) || 0;
    const r = parseFloat(item.restaurant.replace(',', '.')) || 0;
    const m = parseFloat(item.minibar.replace(',', '.')) || 0;
    return sum + d + r + m;
  }, 0);

  const handleGeneratePDF = async () => {
    setLoading(true);
    const element = document.getElementById('voucher-content');
    if (!element) return;

    try {
      // Forçar cores hexadecimais para evitar erro de oklch no html2canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794,
        height: element.offsetHeight,
        windowWidth: 1200, // Forçar layout desktop no clone
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('voucher-content');
          if (el) {
            // Resetar qualquer transformação que possa ter sido herdada
            el.style.transform = 'none';
            el.style.scale = '1';
            el.style.fontFamily = 'Arial, sans-serif';
            el.style.width = '794px';
            
            // Remover tracking de todos os elementos para evitar sobreposição
            const allElements = el.querySelectorAll('*');
            allElements.forEach((node: any) => {
              if (node.style) {
                node.style.letterSpacing = 'normal';
              }
            });

            // Garantir que o pai não esteja escalonado no clone
            if (el.parentElement) {
              el.parentElement.style.transform = 'none';
              el.parentElement.style.scale = '1';
              el.parentElement.style.width = 'auto';
              el.parentElement.style.height = 'auto';
            }
          }
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`resumo_faturamento_${company.slug}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-neutral-900">Resumo de Faturamento Unificado - {company.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form Side */}
          <div className="lg:col-span-5 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Nº Faturamento</label>
                <input 
                  type="text" 
                  value={formData.billingNumber}
                  onChange={(e) => setFormData({...formData, billingNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Vencimento</label>
                <input 
                  type="date" 
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-4">
              <h3 className="text-xs font-bold text-neutral-900 uppercase">Detalhamento das Faturas</h3>
              {selectedFiles.map(file => (
                <div key={file.id} className="space-y-2 border-b border-neutral-100 pb-3 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-3 h-3 text-neutral-400" />
                    <span className="text-[10px] font-bold text-neutral-500 truncate">{file.original_name}</span>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12">
                      <label className="block text-[10px] text-neutral-400 uppercase font-bold">Hóspede/Serviço</label>
                      <input 
                        type="text"
                        value={fileValues[file.id].guest}
                        onChange={(e) => setFileValues({...fileValues, [file.id]: {...fileValues[file.id], guest: e.target.value}})}
                        className="w-full px-2 py-1 border border-neutral-200 rounded text-xs text-neutral-900"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] text-neutral-400 uppercase font-bold">Diárias+TXAS</label>
                      <input 
                        type="text"
                        value={fileValues[file.id].dailyRates}
                        onChange={(e) => setFileValues({...fileValues, [file.id]: {...fileValues[file.id], dailyRates: e.target.value}})}
                        className="w-full px-2 py-1 border border-neutral-200 rounded text-xs text-right text-neutral-900"
                        placeholder="0,00"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] text-neutral-400 uppercase font-bold">Restaurante</label>
                      <input 
                        type="text"
                        value={fileValues[file.id].restaurant}
                        onChange={(e) => setFileValues({...fileValues, [file.id]: {...fileValues[file.id], restaurant: e.target.value}})}
                        className="w-full px-2 py-1 border border-neutral-200 rounded text-xs text-right text-neutral-900"
                        placeholder="0,00"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] text-neutral-400 uppercase font-bold">Minibar</label>
                      <input 
                        type="text"
                        value={fileValues[file.id].minibar}
                        onChange={(e) => setFileValues({...fileValues, [file.id]: {...fileValues[file.id], minibar: e.target.value}})}
                        className="w-full px-2 py-1 border border-neutral-200 rounded text-xs text-right text-neutral-900"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-white p-2 rounded border border-neutral-100">
                    <span className="text-[10px] font-bold text-neutral-400">TOTAL DA FATURA:</span>
                    <span className="text-xs font-bold text-neutral-900">
                      BRL {((parseFloat(fileValues[file.id].dailyRates.replace(',', '.')) || 0) + 
                            (parseFloat(fileValues[file.id].restaurant.replace(',', '.')) || 0) + 
                            (parseFloat(fileValues[file.id].minibar.replace(',', '.')) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-bold text-neutral-900">VALOR TOTAL UNIFICADO:</span>
                <span className="text-lg font-black text-amber-600">BRL {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-1 flex items-center gap-2">
                  <Landmark className="w-3 h-3" />
                  Selecionar Conta Bancária Cadastrada
                </label>
                <select 
                  onChange={(e) => handleBankSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  defaultValue=""
                >
                  <option value="" disabled>Escolha uma conta...</option>
                  {bankAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bank_name} - Ag: {acc.agency} / Cc: {acc.account}
                    </option>
                  ))}
                </select>
                {bankAccounts.length === 0 && !loadingBanks && (
                  <p className="text-[10px] text-red-500 mt-1 font-medium">Nenhuma conta bancária cadastrada no sistema.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Banco (Exibição)</label>
                  <input 
                    type="text" 
                    value={formData.bankName}
                    onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Chave PIX</label>
                  <input 
                    type="text" 
                    value={formData.pixKey}
                    onChange={(e) => setFormData({...formData, pixKey: e.target.value})}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Agência</label>
                  <input 
                    type="text" 
                    value={formData.bankAgency}
                    onChange={(e) => setFormData({...formData, bankAgency: e.target.value})}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Conta</label>
                  <input 
                    type="text" 
                    value={formData.bankAccount}
                    onChange={(e) => setFormData({...formData, bankAccount: e.target.value})}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Observações de Faturamento</label>
              <textarea 
                value={formData.observations}
                onChange={(e) => setFormData({...formData, observations: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>
          </div>

          {/* Preview Side */}
          <div className="lg:col-span-7 bg-neutral-100 p-4 rounded-xl flex flex-col items-center overflow-hidden">
            <div className="sticky top-0 w-full flex justify-between items-center mb-4 z-10">
              <span className="text-xs font-bold text-neutral-500 uppercase">Pré-visualização do Resumo</span>
              <button 
                onClick={handleGeneratePDF}
                disabled={loading}
                className="flex items-center gap-2 bg-amber-500 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors shadow-lg disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Gerar PDF Unificado
              </button>
            </div>
            
            {/* Container para escala da UI */}
            <div className="w-full flex justify-center py-4 overflow-visible">
              <div 
                className="origin-top scale-[0.35] sm:scale-[0.45] lg:scale-[0.55] transition-transform"
                style={{ width: '210mm', height: '297mm' }}
              >
                {/* O elemento id="voucher-content" deve estar em escala 1:1 para o html2canvas capturar corretamente */}
                <div 
                  id="voucher-content"
                  className="bg-white p-[15mm] text-[11px] font-sans shadow-2xl"
                  style={{ 
                    width: '794px', // 210mm em pixels (96dpi)
                    minHeight: '1123px', // 297mm em pixels (96dpi)
                    fontFamily: 'Arial, sans-serif', 
                    color: '#000000', 
                    backgroundColor: '#ffffff',
                    boxSizing: 'border-box',
                    margin: '0',
                    position: 'relative'
                  }}
                >
                  <div className="text-center font-bold text-lg mb-8 uppercase pb-4" style={{ borderBottom: '2px solid #000000', color: '#000000', letterSpacing: '1px' }}>
                    Resumo de Faturamento Unificado
                  </div>

                  <div className="flex justify-between items-start mb-10">
                    <div className="flex items-center gap-6">
                      <div className="h-20 w-auto overflow-hidden flex items-center justify-center">
                        <img 
                          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTWHB7epnz8XIPz-g-0iPpTGKxRxJAYR9xKaQ&s" 
                          alt="Logo Royal Macaé" 
                          className="h-full w-auto object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div>
                        <p className="font-bold text-xl" style={{ color: '#000000' }}>ROYAL MACAÉ</p>
                        <p className="text-sm" style={{ color: '#4b5563' }}>PALACE HOTEL</p>
                        <p className="text-[9px] mt-1" style={{ color: '#000000' }}>Avenida Atlantica, 1642 - Macaé RJ Cep 27920390</p>
                      </div>
                    </div>
                    <div className="text-right" style={{ color: '#000000' }}>
                      <p className="font-bold text-sm uppercase">{company.name}</p>
                      <p>CNPJ: {company.cnpj}</p>
                      <p className="mt-2 font-bold">Nº DOC: {formData.billingNumber}</p>
                      <p>Emissão: {formData.data}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mb-10 p-4 rounded" style={{ border: '1px solid #e5e7eb' }}>
                    <div>
                      <h4 className="font-bold uppercase text-[9px] mb-2 pb-1" style={{ color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Dados do Credor</h4>
                      <p className="font-bold">ROYAL MACAÉ PALACE HOTEL</p>
                      <p>CNPJ: 07.116.901/0001-92</p>
                      <p>IE: 78735821</p>
                      <p>Tel: (22) 2123-9650</p>
                      <p className="mt-2 font-bold uppercase text-[9px]" style={{ color: '#6b7280' }}>Contato Financeiro</p>
                      <p>{formData.emissor}</p>
                      <p className="lowercase">{formData.emissorEmail}</p>
                    </div>
                    <div>
                      <h4 className="font-bold uppercase text-[9px] mb-2 pb-1" style={{ color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>Instruções de Pagamento</h4>
                      <p><span className="font-bold">Vencimento:</span> <span style={{ color: '#dc2626' }} className="font-bold">{formData.dueDate ? new Date(formData.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</span></p>
                      <p className="mt-2"><span className="font-bold">Banco:</span> {formData.bankName}</p>
                      <p><span className="font-bold">Agência:</span> {formData.bankAgency}</p>
                      <p><span className="font-bold">Conta:</span> {formData.bankAccount}</p>
                      <p className="mt-2 p-2 rounded" style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}><span className="font-bold">PIX:</span> {formData.pixKey}</p>
                    </div>
                  </div>

                  <div className="mb-10">
                    <div className="p-2 font-bold uppercase text-center mb-0" style={{ backgroundColor: '#000000', color: '#ffffff' }}>Relação de Documentos Fiscais</div>
                    <table className="w-full border-collapse" style={{ border: '1px solid #d1d5db' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f3f4f6' }}>
                          <th className="p-2 text-left" style={{ border: '1px solid #d1d5db' }}>Hóspede / Descrição</th>
                          <th className="p-2 text-right" style={{ border: '1px solid #d1d5db' }}>Diárias+TXAS</th>
                          <th className="p-2 text-right" style={{ border: '1px solid #d1d5db' }}>Restaurante</th>
                          <th className="p-2 text-right" style={{ border: '1px solid #d1d5db' }}>Minibar</th>
                          <th className="p-2 text-right" style={{ border: '1px solid #d1d5db' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedFiles.map(file => {
                          const d = parseFloat(fileValues[file.id].dailyRates.replace(',', '.')) || 0;
                          const r = parseFloat(fileValues[file.id].restaurant.replace(',', '.')) || 0;
                          const m = parseFloat(fileValues[file.id].minibar.replace(',', '.')) || 0;
                          const rowTotal = d + r + m;
                          return (
                            <tr key={file.id}>
                              <td className="p-2" style={{ border: '1px solid #d1d5db' }}>{fileValues[file.id].guest}</td>
                              <td className="p-2 text-right" style={{ border: '1px solid #d1d5db' }}>{d.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="p-2 text-right" style={{ border: '1px solid #d1d5db' }}>{r.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="p-2 text-right" style={{ border: '1px solid #d1d5db' }}>{m.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="p-2 text-right font-bold" style={{ border: '1px solid #d1d5db' }}>
                                {rowTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          <td colSpan={4} className="p-3 text-right font-bold text-sm" style={{ border: '1px solid #d1d5db' }}>TOTAL UNIFICADO</td>
                          <td className="p-3 text-right font-black text-lg" style={{ border: '1px solid #d1d5db', color: '#000000' }}>
                            BRL {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mb-10 p-4" style={{ borderLeft: '4px solid #f59e0b', backgroundColor: '#f9fafb' }}>
                    <p className="font-bold uppercase text-[9px] mb-1" style={{ color: '#6b7280' }}>Observações Importantes:</p>
                    <p className="text-[10px] leading-relaxed">{formData.observations}</p>
                  </div>

                  <div className="mt-auto pt-10" style={{ borderTop: '1px solid #e5e7eb' }}>
                    <div className="flex justify-between items-end">
                      <div className="text-[9px]" style={{ color: '#9ca3af' }}>
                        <p>Este documento é um resumo consolidado de faturamento.</p>
                        <p>As notas fiscais originais encontram-se anexas no portal.</p>
                        <p>Gerado em: {new Date().toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="text-center w-64">
                        <div className="pt-2 font-bold uppercase" style={{ borderTop: '1px solid #000000' }}>
                          Departamento Financeiro
                        </div>
                        <p className="text-[9px]">Royal Macaé Palace Hotel</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
