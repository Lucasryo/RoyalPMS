import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Company, FiscalFile, UserProfile, Notification, Reservation, ReservationRequest } from '../types';
import { FileText, Search, Loader2, Download, Filter, CheckCircle2, Clock, Sparkles, Eye, X, Bell, BellOff, Receipt, AlertTriangle, Image as ImageIcon, Send, Upload, Calendar, Plus, Mail, Building2, User, Printer, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { logAudit, sendNotification } from '../lib/audit';
import { format, addDays } from 'date-fns';

const FINANCIAL_TYPES = ['FATURA', 'Hospedagem', 'Alimentação', 'Lavanderia', 'Eventos', 'Transporte'];

export default function ClientDashboard({ profile, initialTab = 'active' }: { profile: UserProfile, initialTab?: 'active' | 'trash' | 'reservations' }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [previewFile, setPreviewFile] = useState<FiscalFile | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);
  const [viewingDispute, setViewingDispute] = useState<FiscalFile | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'trash' | 'reservations'>(initialTab);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationRequests, setReservationRequests] = useState<ReservationRequest[]>([]);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [submittingReservation, setSubmittingReservation] = useState(false);
  const [viewingVoucher, setViewingVoucher] = useState<Reservation | ReservationRequest | null>(null);

  // Reservation form state
  const [reservationForm, setReservationForm] = useState({
    guest_name: '',
    check_in: '',
    check_out: '',
    cost_center: '',
    billing_obs: '',
    tariff: 0,
    category: 'executivo',
    guests_per_uh: 1,
    contact_phone: '',
    iss_tax: 5,
    service_tax: 10,
    payment_method: 'BILLED' as 'BILLED' | 'VIRTUAL_CARD',
    billing_info: ''
  });

  const generateReservationCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'RYL-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Filter states
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterPeriodStart, setFilterPeriodStart] = useState<string>('');
  const [filterPeriodEnd, setFilterPeriodEnd] = useState<string>('');

  useEffect(() => {
    if (profile.company_id) {
      fetchData();
      fetchReservations();
      
      // Fetch initial notifications
      const fetchNotifications = async () => {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('timestamp', { ascending: false })
          .limit(10);

        if (data) {
          setNotifications(data.map(n => ({
            id: n.id,
            user_id: n.user_id,
            title: n.title,
            message: n.message,
            timestamp: n.timestamp,
            read: n.read,
            link: n.link
          } as Notification)));
        }
      };

      fetchNotifications();

      // Subscribe to new notifications
      const channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${profile.id}`
          },
          () => {
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setLoading(false);
    }
  }, [profile.company_id, profile.id]);

  const fetchData = async () => {
    console.log("ClientDashboard: fetchData started for company_id:", profile.company_id);
    setLoading(true);
    try {
      // Fetch Company Info
      console.log("ClientDashboard: Fetching company info...");
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id!)
        .single();
      
      if (companyError) {
        console.error("ClientDashboard: Error fetching company:", companyError);
      }

      if (companyData) {
        console.log("ClientDashboard: Company data fetched:", companyData.name);
        setCompany({
          id: companyData.id,
          name: companyData.name,
          cnpj: companyData.cnpj,
          email: companyData.email,
          phone: companyData.phone,
          address: companyData.address,
          status: companyData.status,
          slug: companyData.slug,
          created_at: companyData.created_at
        } as Company);
      }

      // Fetch Files
      console.log("ClientDashboard: Fetching files...");
      const { data: filesData, error: filesError } = await supabase
        .from('files')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      
      if (filesError) {
        console.error("ClientDashboard: Error fetching files:", filesError);
      }

      if (filesData) {
        console.log("ClientDashboard: Files fetched:", filesData.length);
        const filesList = await Promise.all(filesData.map(async (f) => {
          const fileObj: FiscalFile = {
            id: f.id,
            company_id: f.company_id,
            original_name: f.original_name,
            storage_path: f.storage_path,
            type: f.type,
            period: f.period,
            upload_date: f.created_at,
            uploader_id: f.uploader_id,
            amount: f.amount,
            due_date: f.due_date,
            status: f.status,
            viewed_by_client: f.viewed_by_client,
            viewed_at: f.viewed_at,
            is_deleted: f.is_deleted,
            deleted_at: f.deleted_at,
            deleted_by: f.deleted_by,
            proof_url: f.proof_url,
            proof_date: f.proof_date,
            dispute_reason: f.dispute_reason,
            dispute_images: f.dispute_images,
            dispute_at: f.dispute_at,
            tracking_stage: f.tracking_stage,
            tracking_status: f.tracking_status,
            tracking_notes: f.tracking_notes
          };

          try {
            const { data } = supabase.storage.from('files').getPublicUrl(f.storage_path);
            const publicUrl = data?.publicUrl || '';
            return { ...fileObj, download_url: publicUrl };
          } catch (e) {
            console.error("ClientDashboard: Error getting public URL for file:", f.id, e);
            return fileObj;
          }
        }));
        setFiles(filesList);
      }
      console.log("ClientDashboard: fetchData completed successfully");
    } catch (error) {
      console.error("ClientDashboard: Error in fetchData:", error);
    } finally {
      // Don't set loading false here because fetchReservations also runs
    }
  };

  const fetchReservations = async () => {
    try {
      const { data: resData, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      
      if (resError) console.warn("Table 'reservations' might not exist or schema mismatch.");
      if (resData) setReservations(resData as Reservation[]);

      const { data: reqData, error: reqError } = await supabase
        .from('reservation_requests')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });
      
      if (reqError) console.warn("Table 'reservation_requests' might not exist or schema mismatch.");
      if (reqData) setReservationRequests(reqData as ReservationRequest[]);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReservation(true);

    try {
      const resCode = generateReservationCode();
      const taxMultiplier = 1 + ((reservationForm.iss_tax + reservationForm.service_tax) / 100);
      const newRequest: ReservationRequest = {
        ...reservationForm,
        company_id: profile.company_id!,
        reservation_code: resCode,
        requested_by: profile.name,
        created_at: new Date().toISOString(),
        status: 'REQUESTED',
        total_amount: reservationForm.tariff * taxMultiplier
      };

      const { error } = await supabase
        .from('reservation_requests')
        .insert([newRequest]);

      if (error) throw error;

      toast.success('Solicitação de reserva enviada!');
      setShowReservationForm(false);
      setViewingVoucher(newRequest);
      fetchReservations();
      
      // Notify admin, reservations and reception roles
      const { data: staffToNotify } = await supabase.from('profiles').select('id, role');
      const notifyRoles = ['admin', 'reservations', 'reception'];
      const recipients = (staffToNotify || []).filter((u: any) => notifyRoles.includes(u.role));
      for (const recipient of recipients) {
        await sendNotification({
          user_id: recipient.id,
          title: 'Nova Solicitação de Reserva',
          message: `Cliente ${profile.name} (${company?.name || 'sem empresa'}) solicitou reserva (Ref: ${resCode}).`,
          link: '/dashboard'
        });
      }
    } catch (error) {
      console.error("Error requesting reservation:", error);
      toast.error('Erro ao enviar solicitação.');
    } finally {
      setSubmittingReservation(false);
    }
  };

  const handlePrepareExtension = (existingRes: Reservation | ReservationRequest) => {
    // Fill the form with existing data but set new dates
    const checkOut = new Date(existingRes.check_out + 'T12:00:00');
    const newCheckIn = format(checkOut, 'yyyy-MM-dd');
    const newCheckOut = format(addDays(checkOut, 1), 'yyyy-MM-dd');

    setReservationForm({
      guest_name: existingRes.guest_name,
      check_in: newCheckIn,
      check_out: newCheckOut,
      status: 'REQUESTED',
      company_id: profile.company_id!,
      total_amount: existingRes.total_amount,
      cost_center: existingRes.cost_center || '',
      tariff: existingRes.tariff || 0,
      category: existingRes.category || 'executivo',
      guests_per_uh: existingRes.guests_per_uh || 1,
      contact_phone: existingRes.contact_phone || '',
      iss_tax: existingRes.iss_tax || 5,
      service_tax: existingRes.service_tax || 10,
      payment_method: existingRes.payment_method || 'BILLED',
      billing_obs: existingRes.billing_obs || '',
      billing_info: existingRes.billing_info || ''
    });
    
    setShowReservationForm(true);
    toast.info('Formulário preenchido para prorrogação do hóspede ' + existingRes.guest_name);
  };

  const filteredFiles = files.filter(file => {
    if (activeTab === 'trash') return file.is_deleted;
    if (file.is_deleted) return false;
    const typeMatch = filterType === 'ALL' || file.type === filterType;
    const isFinancial = FINANCIAL_TYPES.includes(file.type);
    const filePeriod = isFinancial && file.due_date ? file.due_date.substring(0, 7) : file.period;
    const periodStartMatch = !filterPeriodStart || (filePeriod && filePeriod >= filterPeriodStart);
    const periodEndMatch = !filterPeriodEnd || (filePeriod && filePeriod <= filterPeriodEnd);
    return typeMatch && periodStartMatch && periodEndMatch;
  });

  const markAsViewed = async (file: FiscalFile) => {
    if (!file.viewed_by_client) {
      try {
        const viewedAt = new Date().toISOString();
        await supabase
          .from('files')
          .update({
            viewed_by_client: true,
            viewed_at: viewedAt
          })
          .eq('id', file.id);
        
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, viewed_by_client: true, viewed_at: viewedAt } : f));
      } catch (error) {
        console.error("Error marking file as viewed:", error);
      }
    }
  };

  const handleDownload = async (file: FiscalFile) => {
    await markAsViewed(file);
    toast.success('Iniciando download...');
    logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action: 'Download de Arquivo',
      details: `Arquivo: ${file.original_name}`,
      type: 'download'
    });
  };

  const handleMoveToTrash = async (fileId: string, originalName: string) => {
    if (!window.confirm(`Deseja mover o arquivo "${originalName}" para a lixeira?`)) return;
    try {
      const deletedAt = new Date().toISOString();
      await supabase
        .from('files')
        .update({
          is_deleted: true,
          deleted_at: deletedAt,
          deleted_by: profile.name
        })
        .eq('id', fileId);
      
      setFiles(prev => prev.map(f => f.id === fileId ? { 
        ...f, 
        is_deleted: true, 
        deleted_at: deletedAt, 
        deleted_by: profile.name 
      } : f));
      
      toast.success('Arquivo movido para a lixeira!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Mover para Lixeira (Cliente)',
        details: `Arquivo: ${originalName} (ID: ${fileId})`,
        type: 'delete'
      });
    } catch (error) {
      console.error("Error moving to trash:", error);
      toast.error('Erro ao mover para a lixeira.');
    }
  };

  const handleRecoverFile = async (fileId: string, originalName: string) => {
    try {
      await supabase
        .from('files')
        .update({
          is_deleted: false,
          deleted_at: null,
          deleted_by: null
        })
        .eq('id', fileId);
      
      setFiles(prev => prev.map(f => f.id === fileId ? { 
        ...f, 
        is_deleted: false, 
        deleted_at: undefined, 
        deleted_by: undefined 
      } : f));
      
      toast.success('Arquivo recuperado com sucesso!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Recuperar Arquivo (Cliente)',
        details: `Arquivo: ${originalName} (ID: ${fileId})`,
        type: 'update'
      });
    } catch (error) {
      console.error("Error recovering file:", error);
      toast.error('Erro ao recuperar arquivo.');
    }
  };

  const handlePermanentDeleteFile = async (fileId: string, originalName: string) => {
    if (!window.confirm(`AVISO: Deseja excluir PERMANENTEMENTE o arquivo "${originalName}"? Esta ação não pode ser desfeita.`)) return;
    try {
      // Delete from storage first
      const file = files.find(f => f.id === fileId);
      if (file?.storage_path) {
        await supabase.storage.from('files').remove([file.storage_path]);
      }

      await supabase
        .from('files')
        .delete()
        .eq('id', fileId);

      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success('Arquivo excluído permanentemente!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Exclusão Permanente (Cliente)',
        details: `Arquivo: ${originalName} (ID: ${fileId})`,
        type: 'delete'
      });
    } catch (error) {
      console.error("Error permanently deleting file:", error);
      toast.error('Erro ao excluir arquivo permanentemente.');
    }
  };

  const handlePreview = async (file: FiscalFile) => {
    await markAsViewed(file);
    setPreviewFile(file);
    logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action: 'Visualização de Arquivo',
      details: `Arquivo: ${file.original_name}`,
      type: 'download'
    });
  };

  const markNotificationRead = async (id: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
    } catch (error) {
      console.error("Error marking notification read:", error);
    }
  };

  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFileId) return;

    setUploadingProof(true);
    try {
      const storagePath = `proofs/${selectedFileId}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('files')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('files')
        .getPublicUrl(storagePath);

      const proofDate = new Date().toISOString();
      await supabase
        .from('files')
        .update({
          proof_url: publicUrl,
          proof_date: proofDate
        })
        .eq('id', selectedFileId);

      setFiles(prev => prev.map(f => f.id === selectedFileId ? { ...f, proof_url: publicUrl, proof_date: proofDate } : f));
      toast.success('Comprovante enviado com sucesso!');
      setProofModalOpen(false);
      setSelectedFileId(null);
      
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Envio de Comprovante',
        details: `Arquivo ID: ${selectedFileId}`,
        type: 'upload'
      });
    } catch (error) {
      console.error("Error uploading proof:", error);
      toast.error('Erro ao enviar comprovante.');
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSendDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFileId || !disputeReason) return;

    setUploadingProof(true);
    try {
      const imageUrls: string[] = [];
      
      for (const file of disputeFiles) {
        const storagePath = `disputes/${selectedFileId}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('files')
          .upload(storagePath, file);
        
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('files')
          .getPublicUrl(storagePath);
        
        imageUrls.push(publicUrl);
      }

      const disputeAt = new Date().toISOString();
      await supabase
        .from('files')
        .update({
          dispute_reason: disputeReason,
          dispute_images: imageUrls,
          dispute_at: disputeAt
        })
        .eq('id', selectedFileId);

      setFiles(prev => prev.map(f => f.id === selectedFileId ? { 
        ...f, 
        dispute_reason: disputeReason, 
        dispute_images: imageUrls, 
        dispute_at: disputeAt 
      } : f));

      toast.success('Contestação enviada com sucesso!');
      setDisputeModalOpen(false);
      setSelectedFileId(null);
      setDisputeReason('');
      setDisputeFiles([]);

      // Notify Admins
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins) {
        for (const admin of admins) {
          await sendNotification({
            user_id: admin.id,
            title: 'Nova Contestação',
            message: `O cliente ${profile.name} da empresa ${company?.name} contestou o arquivo ${files.find(f => f.id === selectedFileId)?.original_name}. Motivo: ${disputeReason.substring(0, 50)}...`,
            link: '/admin'
          });
        }
      }

      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Contestação de Fatura',
        details: `Arquivo ID: ${selectedFileId}, Motivo: ${disputeReason}`,
        type: 'update'
      });
    } catch (error) {
      console.error("Error sending dispute:", error);
      toast.error('Erro ao enviar contestação.');
    } finally {
      setUploadingProof(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!profile.company_id) {
    return (
      <div className="space-y-8">
        <div className="bg-white p-16 rounded-3xl border border-neutral-200 text-center space-y-6 shadow-sm">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-10 h-10 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tighter italic">Acesso Restrito</h2>
            <p className="text-neutral-500 max-w-md mx-auto mt-2 font-medium">
              Sua conta ainda não está vinculada a uma empresa/agência. Entre em contato com o administrador do Royal Macaé para liberar suas ferramentas de faturamento e reservas.
            </p>
          </div>
          <div className="pt-4">
             <a 
              href="mailto:suporte@royalmacaepms.com.br"
              className="inline-flex items-center gap-2 bg-neutral-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-lg active:scale-95"
             >
               Contatar Suporte
             </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Company Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-xl border border-neutral-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-bold text-neutral-900">{company?.name || 'Sua Empresa'}</h2>
            <Sparkles className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-neutral-500 text-sm">CNPJ: {company?.cnpj || 'N/A'}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-neutral-100 rounded-lg text-neutral-600 font-medium text-sm">
            <FileText className="w-4 h-4" />
            {files.length} Documentos
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg text-green-700 font-medium text-sm">
            <CheckCircle2 className="w-4 h-4" />
            {files.filter(f => f.viewed_by_client).length} Visualizados
          </div>
          
          {/* Notification Bell */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-full hover:bg-neutral-100 transition-colors relative"
            >
              <Bell className="w-6 h-6 text-neutral-600" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-neutral-200 shadow-xl z-50 overflow-hidden"
                >
                  <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex justify-between items-center">
                    <h3 className="font-bold text-sm">Notificações</h3>
                    <button onClick={() => setShowNotifications(false)}><X className="w-4 h-4" /></button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {notifications.map(n => (
                      <div 
                        key={n.id} 
                        onClick={() => markNotificationRead(n.id)}
                        className={`p-4 border-b border-neutral-50 cursor-pointer hover:bg-neutral-50 transition-colors ${!n.read ? 'bg-blue-50/30' : ''}`}
                      >
                        <p className="text-xs font-bold text-neutral-900 mb-1">{n.title}</p>
                        <p className="text-xs text-neutral-500">{n.message}</p>
                        <p className="text-[10px] text-neutral-400 mt-2">{new Date(n.timestamp).toLocaleString('pt-BR')}</p>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div className="p-8 text-center text-neutral-400">
                        <BellOff className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">Nenhuma notificação.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex bg-neutral-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'active' 
              ? 'bg-white text-neutral-900 shadow-sm' 
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Documentos Ativos
        </button>
        <button
          onClick={() => setActiveTab('trash')}
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'trash' 
              ? 'bg-white text-neutral-900 shadow-sm' 
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Lixeira
        </button>
        <button
          onClick={() => setActiveTab('reservations')}
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'reservations' 
              ? 'bg-white text-neutral-900 shadow-sm' 
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          Reservas
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === 'reservations' ? (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-neutral-200">
            <div>
              <h3 className="text-xl font-bold text-neutral-900">Portal de Reservas</h3>
              <p className="text-neutral-500 text-sm">Gerencie solicitações corporativas e acompanhe hospedagens.</p>
            </div>
            <button 
              onClick={() => setShowReservationForm(true)}
              className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-lg active:scale-95"
            >
              <Plus className="w-5 h-5" />
              Solicitar Reserva
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Reservations */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col h-full shadow-sm">
              <div className="p-6 border-b border-neutral-100 bg-neutral-50/50 flex justify-between items-center">
                <h4 className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Reservas Confirmadas / Ativas
                </h4>
              </div>
              <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[600px]">
                {reservations.length > 0 ? reservations.map(res => (
                  <div key={res.id} className="p-6 hover:bg-neutral-50 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-black text-neutral-900 text-lg uppercase tracking-tight">{res.guest_name}</p>
                        <p className="text-xs text-neutral-400 font-mono tracking-widest">{res.reservation_code}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-700`}>
                        {res.status === 'PENDING' ? 'CONFIRMADA' : res.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mb-6 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                      <div className="space-y-1">
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest">Entrada</p>
                        <p className="font-bold text-neutral-700">{new Date(res.check_in + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="space-y-1 text-right border-l border-neutral-200 pl-4">
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest">Saída</p>
                        <p className="font-bold text-neutral-700">{new Date(res.check_out + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-neutral-500 text-[10px] font-black uppercase tracking-widest">
                        <Building2 className="w-4 h-4 text-amber-500" />
                        {res.category} • {res.guests_per_uh} Pessoa(s)
                      </div>
                      <button 
                        onClick={() => setViewingVoucher(res)}
                        className="text-neutral-900 border border-neutral-200 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-neutral-100 transition-all shadow-sm flex items-center gap-2"
                      >
                        <Eye className="w-3 h-3" />
                        Ver Voucher
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="p-12 text-center text-neutral-400">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">Nenhuma reserva ativa</p>
                  </div>
                )}
              </div>
            </div>

            {/* Billed Reservations - For Extension */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col h-full shadow-sm">
              <div className="p-6 border-b border-neutral-100 bg-neutral-50/50 flex justify-between items-center">
                <h4 className="font-bold flex items-center gap-2 text-neutral-500">
                  <FileText className="w-5 h-5 text-neutral-400" />
                  Reservas Faturadas / Histórico
                </h4>
              </div>
              <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[600px]">
                {reservations.filter(r => r.status === 'CHECKED_OUT').length > 0 ? reservations.filter(r => r.status === 'CHECKED_OUT').map(res => (
                  <div key={res.id} className="p-6 hover:bg-neutral-50 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-bold text-neutral-700 text-base uppercase tracking-tight">{res.guest_name}</p>
                        <p className="text-[10px] text-neutral-400 font-mono tracking-widest">{res.reservation_code}</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-neutral-100 text-neutral-500">
                        FATURADA
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-neutral-500 font-medium">
                        Saída em {new Date(res.check_out + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </div>
                      <button 
                        onClick={() => handlePrepareExtension(res)}
                        className="text-amber-600 bg-amber-50 border border-amber-100 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-all shadow-sm flex items-center gap-2"
                      >
                        <Plus className="w-3 h-3" />
                        Prorrogar
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="p-12 text-center text-neutral-400">
                    <p className="text-[10px] font-bold uppercase tracking-widest italic">Nenhuma reserva faturada no histórico</p>
                  </div>
                )}
              </div>
            </div>

            {/* Pending Requests */}
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col h-full shadow-sm">
              <div className="p-6 border-b border-neutral-100 bg-neutral-50/50">
                <h4 className="font-bold flex items-center gap-2 text-amber-600">
                  <Clock className="w-5 h-5" />
                  Solicitações em Análise
                </h4>
              </div>
              <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[600px]">
                {reservationRequests.length > 0 ? reservationRequests.map(req => (
                  <div key={req.id} className="p-6 hover:bg-neutral-50 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-black text-neutral-900 text-lg uppercase tracking-tight">{req.guest_name}</p>
                        <p className="text-xs text-neutral-400 font-mono tracking-widest font-bold">{req.reservation_code}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${
                        req.status === 'REJECTED' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse'
                      }`}>
                        {req.status === 'REQUESTED' ? 'EM ANÁLISE' : req.status === 'REJECTED' ? 'NEGADA' : req.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-2 font-black uppercase tracking-widest bg-neutral-50 px-3 py-1 rounded-lg">
                        <Calendar className="w-3.5 h-3.5" />
                        Solicitado em {new Date(req.created_at).toLocaleDateString('pt-BR')}
                      </div>
                      <button 
                        onClick={() => setViewingVoucher(req)}
                        className="text-neutral-900 border border-neutral-200 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-neutral-100 transition-all shadow-sm"
                      >
                        Ver Detalhes
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="p-12 text-center text-neutral-400">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">Nenhuma solicitação pendente</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Guidelines for alterations */}
          <div className="bg-[#1A1A1A] rounded-2xl p-8 border border-neutral-800 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg rotate-3 group hover:rotate-0 transition-transform duration-300">
                <AlertTriangle className="w-8 h-8 text-black" />
              </div>
              <div className="text-left">
                <p className="font-black text-white text-xl uppercase tracking-tighter mb-1">Precisa alterar ou cancelar uma reserva?</p>
                <p className="text-neutral-400 text-sm max-w-xl font-medium">Por segurança, alterações em reservas já processadas devem ser enviadas ao nosso setor comercial. Nossa equipe analisará a disponibilidade e as tarifas vigentes.</p>
              </div>
            </div>
            <a 
              href={`mailto:reservas@royalmacaepms.com.br?subject=Solicitação de Alteração de Reserva - ${company?.name}`}
              className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-amber-500 hover:text-black transition-all active:scale-95 shadow-lg shrink-0"
            >
              <Mail className="w-5 h-5" />
              Falar com Reservas
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm flex flex-wrap items-center gap-4"
          >
        <div className="flex items-center gap-2 text-neutral-500 mr-2">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filtros:</span>
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        >
          <option value="ALL">Todos os Tipos</option>
          <option value="NF">NF</option>
          <option value="DANFE">DANFE</option>
          <option value="EXTRATO">EXTRATO</option>
          <option value="FATURA">FATURA</option>
          <option value="Hospedagem">Hospedagem</option>
          <option value="Alimentação">Alimentação</option>
          <option value="Lavanderia">Lavanderia</option>
          <option value="Eventos">Eventos</option>
          <option value="Transporte">Transporte</option>
          <option value="OUTRO">OUTROS</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">De:</span>
          <input
            type="month"
            value={filterPeriodStart}
            onChange={(e) => setFilterPeriodStart(e.target.value)}
            className="px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <span className="text-xs text-neutral-400">Até:</span>
          <input
            type="month"
            value={filterPeriodEnd}
            onChange={(e) => setFilterPeriodEnd(e.target.value)}
            className="px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        {(filterType !== 'ALL' || filterPeriodStart || filterPeriodEnd) && (
          <button
            onClick={() => { setFilterType('ALL'); setFilterPeriodStart(''); setFilterPeriodEnd(''); }}
            className="text-xs text-neutral-400 hover:text-neutral-900 underline"
          >
            Limpar Filtros
          </button>
        )}
      </motion.div>

      {/* File List */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Tipo</th>
                <th className="px-6 py-3 font-medium">Vencimento/Comp.</th>
                <th className="px-6 py-3 font-medium">Nome do Arquivo</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredFiles.map(file => (
                <tr key={file.id} className="hover:bg-neutral-50 transition-colors group">
                  <td className="px-6 py-4 text-sm">
                    {!file.viewed_by_client ? (
                      <span className="flex items-center gap-1.5 text-amber-600 font-bold text-[10px] uppercase bg-amber-50 px-2 py-1 rounded-full w-fit animate-pulse">
                        <Clock className="w-3 h-3" />
                        Novo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-neutral-400 font-medium text-[10px] uppercase bg-neutral-50 px-2 py-1 rounded-full w-fit">
                        <CheckCircle2 className="w-3 h-3" />
                        Lido
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 bg-neutral-100 rounded text-[10px] font-bold text-neutral-600 uppercase">
                      {file.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {FINANCIAL_TYPES.includes(file.type) && file.due_date ? (
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-neutral-700">
                          {new Date(file.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                        {(() => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const due = new Date(file.due_date + 'T12:00:00');
                          due.setHours(0, 0, 0, 0);
                          
                          if (due < today) return <span className="text-[10px] font-bold text-red-500 uppercase">Vencida</span>;
                          if (due.getTime() === today.getTime()) return <span className="text-[10px] font-bold text-amber-500 uppercase">Vence Hoje</span>;
                          return <span className="text-[10px] font-bold text-green-500 uppercase">A Vencer</span>;
                        })()}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-500">{file.period || '-'}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-900 font-medium">
                    {file.original_name}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {activeTab === 'trash' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRecoverFile(file.id, file.original_name)}
                            className="p-2 text-neutral-400 hover:text-green-600 transition-colors"
                            title="Recuperar Arquivo"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePermanentDeleteFile(file.id, file.original_name)}
                            className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                            title="Excluir Permanentemente"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {FINANCIAL_TYPES.includes(file.type) && file.status !== 'CANCELLED' && (
                            <>
                              {!file.proof_url ? (
                                <button
                                  onClick={() => {
                                    setSelectedFileId(file.id);
                                    setProofModalOpen(true);
                                  }}
                                  className="p-2 text-neutral-400 hover:text-green-600 transition-colors"
                                  title="Enviar Comprovante"
                                >
                                  <Receipt className="w-4 h-4" />
                                </button>
                              ) : (
                                <span className="p-2 text-green-600" title="Comprovante Enviado">
                                  <CheckCircle2 className="w-4 h-4" />
                                </span>
                              )}
                              {!file.dispute_at ? (
                                <button
                                  onClick={() => {
                                    setSelectedFileId(file.id);
                                    setDisputeModalOpen(true);
                                  }}
                                  className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                                  title="Informar Erro / Contestar"
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </button>
                              ) : (
                                <button 
                                  onClick={() => setViewingDispute(file)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Ver Contestação"
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => handlePreview(file)}
                            className="inline-flex items-center gap-2 bg-neutral-100 text-neutral-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-neutral-200 transition-all"
                          >
                            <Eye className="w-3 h-3" />
                            Ver
                          </button>
                          {file.download_url && (
                            <a
                              href={file.download_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => handleDownload(file)}
                              className="inline-flex items-center gap-2 bg-neutral-900 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-neutral-800 transition-all transform group-hover:scale-105"
                            >
                              <Download className="w-3 h-3" />
                              Baixar
                            </a>
                          )}
                          <button
                            onClick={() => handleMoveToTrash(file.id, file.original_name)}
                            className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                            title="Mover para Lixeira"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-neutral-500 text-sm">
                    Nenhum documento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
        </>
      )}

      {/* Reservation Request Modal */}
      <AnimatePresence>
        {showReservationForm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl my-8"
            >
              <div className="p-8 border-b border-neutral-100 bg-neutral-900 text-white flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl -mr-16 -mt-16"></div>
                <div className="relative z-10">
                  <h3 className="text-2xl font-black uppercase tracking-tighter italic">Solicitar Reserva</h3>
                  <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest mt-1">Portal Corporativo • {company?.name}</p>
                </div>
                <button onClick={() => setShowReservationForm(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleRequestReservation} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Guest Info */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Nome Completo do Hóspede</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                      <input
                        required
                        type="text"
                        value={reservationForm.guest_name}
                        onChange={(e) => setReservationForm({...reservationForm, guest_name: e.target.value})}
                        className="w-full pl-12 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                        placeholder="Ex: João Silva"
                      />
                    </div>
                  </div>

                  {/* Dates */}
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Check-in (Entrada)</label>
                    <input
                      required
                      type="date"
                      value={reservationForm.check_in}
                      onChange={(e) => setReservationForm({...reservationForm, check_in: e.target.value})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Check-out (Saída)</label>
                    <input
                      required
                      type="date"
                      value={reservationForm.check_out}
                      onChange={(e) => setReservationForm({...reservationForm, check_out: e.target.value})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    />
                  </div>

                  {/* Corporate Details */}
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Centro de Custo</label>
                    <input
                      required
                      type="text"
                      value={reservationForm.cost_center}
                      onChange={(e) => setReservationForm({...reservationForm, cost_center: e.target.value})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="Ex: Financeiro-01"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Forma de Pagamento</label>
                    <select
                      value={reservationForm.payment_method}
                      onChange={(e) => setReservationForm({...reservationForm, payment_method: e.target.value as any})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    >
                      <option value="BILLED">Faturado para Empresa</option>
                      <option value="VIRTUAL_CARD">Cartão Virtual / Voucher</option>
                    </select>
                  </div>

                  {/* Room Details */}
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Categoria</label>
                    <select
                      value={reservationForm.category}
                      onChange={(e) => setReservationForm({...reservationForm, category: e.target.value})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    >
                      <option value="executivo">Executivo</option>
                      <option value="premium">Premium</option>
                      <option value="luxo">Luxo</option>
                      <option value="suite">Suíte Presidencial</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Hóspedes por UH</label>
                    <input
                      required
                      type="number"
                      min="1"
                      max="4"
                      value={reservationForm.guests_per_uh}
                      onChange={(e) => setReservationForm({...reservationForm, guests_per_uh: parseInt(e.target.value)})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    />
                  </div>

                  {/* Financials */}
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Tarifa (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={reservationForm.tariff}
                      onChange={(e) => setReservationForm({...reservationForm, tariff: parseFloat(e.target.value)})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Telefone p/ Contato</label>
                    <input
                      required
                      type="tel"
                      value={reservationForm.contact_phone}
                      onChange={(e) => setReservationForm({...reservationForm, contact_phone: e.target.value})}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                      placeholder="(22) 99999-9999"
                    />
                  </div>

                  {/* Taxes (Read only or based on rules) */}
                  <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100 md:col-span-2">
                     <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">Impostos e Taxas Incidentes</p>
                     <div className="flex gap-8">
                        <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-neutral-700">ISS:</span>
                           <span className="text-xs text-neutral-500">{reservationForm.iss_tax}% (já incluso no cálculo)</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-neutral-700">Taxa de Serviço:</span>
                           <span className="text-xs text-neutral-500">{reservationForm.service_tax}% (já incluso no cálculo)</span>
                        </div>
                     </div>
                  </div>

                  {/* Large text areas */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Observações para Faturamento</label>
                    <textarea
                      value={reservationForm.billing_obs}
                      onChange={(e) => setReservationForm({...reservationForm, billing_obs: e.target.value})}
                      placeholder="Instruções específicas para a nota fiscal ou faturamento..."
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all min-h-[80px]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Informações para Emissão de Nota Fiscal</label>
                    <textarea
                      value={reservationForm.billing_info}
                      onChange={(e) => setReservationForm({...reservationForm, billing_info: e.target.value})}
                      placeholder="CNPJ, Razão Social, Endereço e E-mail de destino da NF..."
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all min-h-[80px]"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    disabled={submittingReservation}
                    type="submit"
                    className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-neutral-800 transition-all shadow-xl flex items-center justify-center gap-2 group"
                  >
                    {submittingReservation ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Enviar Solicitação de Reserva
                        <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voucher Detail Modal */}
      <AnimatePresence>
        {viewingVoucher && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl my-8 relative"
            >
              {/* Printable Area */}
              <div id="voucher-print" className="p-10 space-y-8 bg-white">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-neutral-100 pb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-neutral-900 rounded-xl flex items-center justify-center text-white shrink-0">
                      <Building2 className="w-7 h-7" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tighter italic leading-none">Voucher de Reserva</h2>
                      <p className="text-xs text-neutral-400 font-bold uppercase tracking-widest mt-1">Royal Macaé Hotel • Corporativo</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest leading-none mb-1">Código de Referência</p>
                    <p className="text-xl font-black text-neutral-900 font-mono tracking-widest">{viewingVoucher.reservation_code}</p>
                  </div>
                </div>

                {/* Status Alert */}
                <div className={`p-4 rounded-xl flex items-center justify-between border ${
                   (viewingVoucher as ReservationRequest).status === 'REQUESTED' 
                   ? 'bg-amber-50 border-amber-100 text-amber-900' 
                   : 'bg-green-50 border-green-100 text-green-900'
                }`}>
                   <div className="flex items-center gap-3">
                      { (viewingVoucher as ReservationRequest).status === 'REQUESTED' ? <Clock className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" /> }
                      <span className="text-sm font-bold uppercase tracking-tight">Status da Reserva: {(viewingVoucher as ReservationRequest).status === 'REQUESTED' ? 'EM ANÁLISE' : 'CONFIRMADA'}</span>
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Emitido em {new Date().toLocaleDateString('pt-BR')}</span>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                   <div className="space-y-4">
                      <div>
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Hóspede Principal</p>
                        <p className="text-lg font-black text-neutral-900 uppercase">{viewingVoucher.guest_name}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Check-in</p>
                          <p className="font-bold text-neutral-700">{new Date(viewingVoucher.check_in + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Check-out</p>
                          <p className="font-bold text-neutral-700">{new Date(viewingVoucher.check_out + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Agência / Empresa Solicitante</p>
                        <p className="font-bold text-neutral-700">{company?.name}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Centro de Custo</p>
                          <p className="font-bold text-neutral-700">{viewingVoucher.cost_center}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Pagamento</p>
                          <p className="font-bold text-neutral-700">{viewingVoucher.payment_method === 'BILLED' ? 'FATURADO' : 'CARTÃO VIRTUAL'}</p>
                        </div>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div>
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Categoria de UH</p>
                        <p className="font-black text-neutral-900 uppercase">{viewingVoucher.category}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Hóspedes p/ UH</p>
                          <p className="font-bold text-neutral-700">{viewingVoucher.guests_per_uh} Pessoa(s)</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Tarifa Acordada</p>
                          <p className="font-bold text-neutral-700">{viewingVoucher.tariff.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Telefone de Contato</p>
                        <p className="font-bold text-neutral-700">{viewingVoucher.contact_phone}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">ISS (5%)</p>
                          <p className="font-bold text-neutral-700">{(viewingVoucher.tariff * 0.05).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-1">Taxa Serv. (10%)</p>
                          <p className="font-bold text-neutral-700">{(viewingVoucher.tariff * 0.1).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                      </div>
                   </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-neutral-100">
                   <div>
                      <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-2">Instruções de Faturamento</p>
                      <div className="bg-neutral-50 p-4 rounded-xl text-xs text-neutral-600 font-medium leading-relaxed italic border border-neutral-100">
                        {viewingVoucher.billing_obs || 'Sem observações adicionais.'}
                      </div>
                   </div>
                   <div>
                      <p className="text-[10px] text-neutral-400 font-black uppercase tracking-widest mb-2">Dados para Emissão de Nota Fiscal</p>
                      <div className="bg-neutral-50 p-4 rounded-xl text-xs text-neutral-600 font-medium leading-relaxed border border-neutral-100">
                        {viewingVoucher.billing_info || 'Utilizar dados cadastrais da empresa/agência.'}
                      </div>
                   </div>
                </div>

                {/* Footer Guide */}
                <div className="pt-8 text-center text-[9px] text-neutral-400 uppercase tracking-widest font-black leading-relaxed">
                   Este documento é um registro corporativo interno do Royal Macaé PMS Desktop.<br />
                   Para alterações, contate o setor comercial através do e-mail: reservas@royalmacaepms.com.br
                </div>
              </div>

              {/* Action Buttons (Not for print) */}
              <div className="p-8 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-4">
                 <button 
                  onClick={() => setViewingVoucher(null)}
                  className="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors"
                 >
                   Fechar
                 </button>
                 <button 
                  onClick={() => window.print()}
                  className="bg-neutral-900 text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg flex items-center gap-2"
                 >
                   <Printer className="w-4 h-4" />
                   Imprimir / Salvar PDF
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Proof Upload Modal */}
      <AnimatePresence>
        {proofModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-green-600" />
                  Enviar Comprovante
                </h3>
                <button onClick={() => setProofModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-neutral-500">
                  Selecione o arquivo do comprovante de pagamento para esta fatura.
                </p>
                <div className="border-2 border-dashed border-neutral-200 rounded-xl p-8 text-center hover:border-neutral-300 transition-colors relative">
                  <input
                    type="file"
                    onChange={handleUploadProof}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={uploadingProof}
                  />
                  {uploadingProof ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
                      <span className="text-sm text-neutral-500">Enviando...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-neutral-400" />
                      <span className="text-sm font-medium text-neutral-600">Clique ou arraste o arquivo</span>
                      <span className="text-[10px] text-neutral-400">PDF, JPG ou PNG</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dispute Modal */}
      <AnimatePresence>
        {disputeModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Contestar Fatura / Informar Erro
                </h3>
                <button onClick={() => setDisputeModalOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSendDispute} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Motivo da Contestação</label>
                  <textarea
                    required
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Descreva o erro encontrado na fatura..."
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 min-h-[120px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Anexar Imagens (Opcional)</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {disputeFiles.map((f, i) => (
                      <div key={i} className="px-3 py-1 bg-neutral-100 rounded-full text-[10px] flex items-center gap-2">
                        {f.name}
                        <button type="button" onClick={() => setDisputeFiles(prev => prev.filter((_, idx) => idx !== i))}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setDisputeFiles(prev => [...prev, ...files]);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-2 px-4 py-2 bg-neutral-100 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-200 transition-colors w-fit">
                      <ImageIcon className="w-4 h-4" />
                      Adicionar Imagens
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDisputeModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-neutral-200 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingProof}
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {uploadingProof ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar Contestação
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Dispute Modal */}
      <AnimatePresence>
        {viewingDispute && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Detalhes da Contestação
                </h3>
                <button onClick={() => setViewingDispute(null)} className="p-2 hover:bg-neutral-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <p className="text-xs font-bold text-red-600 uppercase mb-1">Seu Motivo</p>
                  <p className="text-sm text-red-900">{viewingDispute.disputeReason}</p>
                  <p className="text-[10px] text-red-400 mt-2">Enviado em: {new Date(viewingDispute.disputeAt || '').toLocaleString('pt-BR')}</p>
                  
                  {viewingDispute.disputeImages && viewingDispute.disputeImages.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-bold text-red-600 uppercase mb-2">Imagens Anexadas</p>
                      <div className="flex flex-wrap gap-2">
                        {viewingDispute.disputeImages.map((img, i) => (
                          <a key={i} href={img} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-red-200 hover:opacity-80 transition-opacity">
                            <img src={img} alt={`Anexo ${i+1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {viewingDispute.disputeResponse ? (
                  <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm">
                    <p className="text-xs font-bold text-green-600 uppercase mb-2">Resposta do Administrador</p>
                    <p className="text-sm text-neutral-800 italic">"{viewingDispute.disputeResponse}"</p>
                    <p className="text-[10px] text-neutral-400 mt-3 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      Resolvido em: {new Date(viewingDispute.disputeResolvedAt || '').toLocaleString('pt-BR')}
                    </p>
                  </div>
                ) : (
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="text-sm font-bold text-amber-900">Aguardando Resposta</p>
                      <p className="text-xs text-amber-700">O administrador ainda não analisou sua contestação.</p>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => setViewingDispute(null)}
                    className="w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
