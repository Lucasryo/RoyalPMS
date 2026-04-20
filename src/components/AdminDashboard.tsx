import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Company, FiscalFile, UserProfile, UserRole, UserPermissions, AuditLog, Notification } from '../types';
import { PDFDocument } from 'pdf-lib';
import { Plus, Upload, Building2, FileText, Search, Loader2, Download, Trash2, Users, CheckCircle2, Clock, History, Bell, BellOff, Sparkles, Calendar, Check, Edit2, X as CloseIcon, DollarSign, TrendingUp, AlertCircle, CheckCircle, PieChart as PieChartIcon, BarChart as BarChartIcon, Receipt, AlertTriangle, Send, Layers, ArrowUp, ArrowDown, FilePlus } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { logAudit, sendNotification } from '../lib/audit';
import { extractDueDateFromPdf, parseItauStatement } from '../lib/geminiExtractor';
import VoucherModal from './VoucherModal';
import PermissionsSelector, { DEFAULT_PERMISSIONS } from './PermissionsSelector';
import BankAccountsManager from './BankAccountsManager';
import TariffManager from './TariffManager';
import CompanyManager from './CompanyManager';
import StaffManager from './StaffManager';
import GuestManager from './GuestManager';
import InvoiceTracker from './InvoiceTracker';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const FINANCIAL_TYPES = ['FATURA', 'Hospedagem', 'Alimentação', 'Lavanderia', 'Eventos', 'Transporte', 'Fatura Evento'];

const formatAuditDetails = (details: unknown) => {
  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details ?? '');
  }
};

export default function AdminDashboard({ profile, initialTab = 'documents' }: { 
  profile: UserProfile, 
  initialTab?: 'documents' | 'banks' | 'finance' | 'assembly' | 'bi' | 'tariffs' | 'companies' | 'users' | 'guests' | 'stats' | 'tracking' | 'registration'
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [documentsSubTab, setDocumentsSubTab] = useState<'all' | 'trash'>('all');
  const [financeSubTab, setFinanceSubTab] = useState<'pending' | 'paid' | 'cancelled' | 'trash' | 'disputed'>('pending');
  const [financeSearchTerm, setFinanceSearchTerm] = useState('');
  const [financeCompanyFilter, setFinanceCompanyFilter] = useState('');
  const [financeCategoryFilter, setFinanceCategoryFilter] = useState('');
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingFileId, setCancellingFileId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [viewingFileDetails, setViewingFileDetails] = useState<FiscalFile | null>(null);
  const [disputeResponse, setDisputeResponse] = useState('');
  const [resolvingDispute, setResolvingDispute] = useState(false);

  // Finance states
  const [financeMainTab, setFinanceMainTab] = useState<'overview' | 'baixa' | 'itau' | 'extratos'>('overview');
  const [itauRawText, setItauRawText] = useState('');
  const [itauExtractedData, setItauExtractedData] = useState<any[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [savedStatements, setSavedStatements] = useState<any[]>([]);
  const [monthlyGoal, setMonthlyGoal] = useState<number>(0);
  const [monthlyGoalInput, setMonthlyGoalInput] = useState<string>('');
  const [savingGoal, setSavingGoal] = useState(false);

  // Form states
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCnpj, setNewCompanyCnpj] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [fileType, setFileType] = useState<FiscalFile['type']>('NF');
  const [category, setCategory] = useState('Outros');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [detectedDates, setDetectedDates] = useState<Record<string, string>>({});
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('client');
  const [newUserCompanyId, setNewUserCompanyId] = useState('');
  const [newUserPermissions, setNewUserPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS['client']);

  // Assembly states
  const [assemblyFiles, setAssemblyFiles] = useState<File[]>([]);
  const [assemblyCompanyId, setAssemblyCompanyId] = useState('');
  const [assemblyAmount, setAssemblyAmount] = useState('');
  const [assemblyDueDate, setAssemblyDueDate] = useState('');
  const [assemblyFileType, setAssemblyFileType] = useState<string>('FATURA');
  const [assemblyFileName, setAssemblyFileName] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // Filter states
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [filterFileType, setFilterFileType] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [tempDueDate, setTempDueDate] = useState('');
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [tempAmount, setTempAmount] = useState('');

  useEffect(() => {
    fetchData();
    fetchMonthlyGoal();

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
        (payload) => {
          // Refresh notifications on change
          fetchNotifications();
        }
      )
      .subscribe();

    fetchNotifications();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id]);

  const fetchMonthlyGoal = async () => {
    try {
      const { data } = await supabase.from('app_settings').select('*').eq('id', 'monthly_revenue_goal').maybeSingle();
      if (data?.value) setMonthlyGoal(Number(data.value) || 0);
    } catch (e) { /* settings may not exist yet */ }
  };

  const handleSaveMonthlyGoal = async () => {
    const valueNum = parseFloat(monthlyGoalInput.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valueNum) || valueNum < 0) {
      toast.error('Valor inválido. Informe um número positivo.');
      return;
    }
    setSavingGoal(true);
    try {
      const { data: existing } = await supabase.from('app_settings').select('*').eq('id', 'monthly_revenue_goal').maybeSingle();
      const payload = { value: String(valueNum), updated_at: new Date().toISOString(), updated_by: profile.id };
      if (existing) {
        await supabase.from('app_settings').update(payload).eq('id', 'monthly_revenue_goal');
      } else {
        await supabase.from('app_settings').insert([{ id: 'monthly_revenue_goal', ...payload }]);
      }
      setMonthlyGoal(valueNum);
      setMonthlyGoalInput('');
      try { localStorage.setItem('monthly_revenue_goal', String(valueNum)); } catch (_) {}
      toast.success('Meta mensal atualizada com sucesso!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Atualização de Meta Mensal',
        details: JSON.stringify({ novo_valor: valueNum }),
        type: 'update'
      });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar meta.');
    } finally {
      setSavingGoal(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('timestamp', { ascending: false })
        .limit(10);
      
      if (error) {
        console.error("Error fetching notifications:", error);
        return;
      }

      if (data) {
        setNotifications(data.map(n => ({
          id: n.id,
          user_id: n.user_id,
          title: n.title,
          message: n.message,
          read: n.read,
          timestamp: n.timestamp,
          link: n.link
        } as Notification)));
      }
    } catch (error) {
      console.error("Unexpected error fetching notifications:", error);
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
      
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (error) {
      console.error("Error marking notification read:", error);
    }
  };

  const handleResolveDispute = async () => {
    if (!viewingFileDetails || !disputeResponse) return;
    setResolvingDispute(true);
    try {
      const resolvedAt = new Date().toISOString();
      await supabase
        .from('files')
        .update({
          dispute_response: disputeResponse,
          dispute_resolved_at: resolvedAt
        })
        .eq('id', viewingFileDetails.id);

      setFiles(prev => prev.map(f => f.id === viewingFileDetails.id ? { 
        ...f, 
        dispute_response: disputeResponse, 
        dispute_resolved_at: resolvedAt 
      } : f));

      // Notify users of that company
      const companyUsers = users.filter(u => u.company_id === viewingFileDetails.company_id);
      for (const user of companyUsers) {
        await sendNotification({
          user_id: user.id,
          title: 'Contestação Respondida',
          message: `A contestação da fatura ${viewingFileDetails.original_name} foi respondida.`,
          link: '/dashboard'
        });
      }

      toast.success('Contestação respondida com sucesso!');
      setViewingFileDetails(null);
      setDisputeResponse('');
      
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Resolução de Contestação',
        details: `Arquivo ID: ${viewingFileDetails.id}, Resposta: ${disputeResponse}`,
        type: 'update'
      });
    } catch (error) {
      console.error("Error resolving dispute:", error);
      toast.error('Erro ao responder contestação.');
    } finally {
      setResolvingDispute(false);
    }
  };

  const handleSaveStatement = async () => {
    if (itauExtractedData.length === 0) return;
    try {
      const statement = {
        name: `Extrato Itaú - ${new Date().toLocaleDateString('pt-BR')}`,
        transactions: itauExtractedData,
        created_by: profile.name
      };
      const { error } = await supabase.from('bank_statements').insert([statement]);
      if (error) throw error;
      toast.success('Extrato salvo com sucesso');
      setItauRawText('');
      setItauExtractedData([]);
      fetchData();
    } catch (error) {
      toast.error('Erro ao salvar extrato');
    }
  };

  const handleProcessItau = async () => {
    if (!itauRawText.trim()) {
      toast.error('Cole os dados do extrato antes de processar');
      return;
    }
    setIsExtracting(true);
    try {
      const data = await parseItauStatement(itauRawText);
      if (data && data.length > 0) {
        setItauExtractedData(data);
        toast.success(`${data.length} transações identificadas!`);
      } else {
        toast.error('Nenhuma transação identificada. Verifique o texto colado.');
      }
    } catch (error) {
      toast.error('Erro ao processar dados.');
    } finally {
      setIsExtracting(false);
    }
  };

  const downloadStatementAsCSV = (stmt: any) => {
    if (!stmt.transactions || stmt.transactions.length === 0) {
      toast.error('Nenhuma transação para baixar.');
      return;
    }

    const headers = ['Data', 'Descrição', 'Documento', 'Valor'];
    const rows = stmt.transactions.map((t: any) => [
      new Date(t.date).toLocaleDateString('pt-BR'),
      t.description.replace(/;/g, ','),
      (t.doc_number || '').replace(/;/g, ','),
      t.amount.toString().replace('.', ',')
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map((r: any) => r.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${stmt.name || 'extrato'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Extrato baixado com sucesso!');
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [companiesRes, filesRes, usersRes, auditRes, statementsRes] = await Promise.all([
        supabase.from('companies').select('*'),
        supabase.from('files').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
        supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(50),
        supabase.from('bank_statements').select('*').order('created_at', { ascending: false })
      ]);

      if (companiesRes.error) console.error("Error fetching companies:", companiesRes.error);
      if (filesRes.error) console.error("Error fetching files:", filesRes.error);
      if (usersRes.error) console.error("Error fetching profiles:", usersRes.error);
      if (auditRes.error) console.error("Error fetching audit_logs:", auditRes.error);
      if (statementsRes.error) console.error("Error fetching bank_statements:", statementsRes.error);

      if (statementsRes.data) {
        setSavedStatements(statementsRes.data);
      }

      if (companiesRes.data) {
        setCompanies(companiesRes.data.map(c => ({
          id: c.id,
          name: c.name,
          cnpj: c.cnpj,
          slug: c.slug || c.name.toLowerCase().replace(/\s+/g, '-')
        } as Company)));
      }

      if (filesRes.data) {
        const filesList = await Promise.all(filesRes.data.map(async (f) => {
          const { data } = supabase.storage.from('files').getPublicUrl(f.storage_path);
          const publicUrl = data?.publicUrl || '';
          return {
            id: f.id,
            company_id: f.company_id,
            companyId: f.company_id,
            type: f.type,
            period: f.period,
            due_date: f.due_date,
            dueDate: f.due_date,
            amount: f.amount,
            category: f.category,
            status: f.status,
            original_name: f.original_name,
            originalName: f.original_name,
            storage_path: f.storage_path,
            storagePath: f.storage_path,
            upload_date: f.created_at,
            uploadDate: f.created_at,
            uploader_id: f.uploader_id,
            uploaderId: f.uploader_id,
            download_url: publicUrl,
            downloadUrl: publicUrl,
            is_deleted: f.is_deleted,
            deleted_at: f.deleted_at,
            deleted_by: f.deleted_by,
            viewed_by_client: f.viewed_by_client,
            viewedByClient: f.viewed_by_client,
            viewed_at: f.viewed_at,
            viewedAt: f.viewed_at,
            proof_url: f.proof_url,
            proof_date: f.proof_date,
            proofDate: f.proof_date,
            dispute_at: f.dispute_at,
            disputeAt: f.dispute_at,
            dispute_reason: f.dispute_reason,
            disputeReason: f.dispute_reason,
            dispute_response: f.dispute_response,
            disputeResponse: f.dispute_response,
            dispute_resolved_at: f.dispute_resolved_at,
            disputeResolvedAt: f.dispute_resolved_at,
            event_os_number: f.event_os_number
          } as FiscalFile;
        }));
        setFiles(filesList);
      }

      if (usersRes.data) {
        setUsers(usersRes.data.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          company_id: u.company_id,
          photo_url: u.photo_url
        } as UserProfile)));
      }

      if (auditRes.data) {
        setAuditLogs(auditRes.data.map(a => ({
          id: a.id,
          user_id: a.user_id,
          user_name: a.user_name,
          action: a.action,
          details: formatAuditDetails(a.details),
          timestamp: a.timestamp,
          type: a.action.toLowerCase().includes('upload') ? 'upload' : 'update'
        } as AuditLog)));
      }
    } catch (error) {
      console.error("AdminDashboard: Error in fetchData:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDetectDueDate = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast.error('Selecione um arquivo primeiro.');
      return;
    }

    setIsDetecting(true);
    try {
      const files = Array.from(selectedFiles) as File[];
      toast.info(`Analisando ${files.length} documento(s) para encontrar os vencimentos...`);
      
      const newDetectedDates: Record<string, string> = { ...detectedDates };
      let successCount = 0;

      for (const file of files) {
        if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) continue;
        
        // Skip if already detected to save API calls if user adds more files
        if (newDetectedDates[file.name]) {
          successCount++;
          continue;
        }

        const detectedDate = await extractDueDateFromPdf(file);
        if (detectedDate) {
          newDetectedDates[file.name] = detectedDate;
          successCount++;
        }
      }

      setDetectedDates(newDetectedDates);
      
      if (successCount > 0) {
        // Set the first one to the main input for visual feedback
        const firstDate = Object.values(newDetectedDates)[0];
        setDueDate(firstDate);
        toast.success(`${successCount} vencimento(s) identificado(s).`);
      } else {
        toast.error('Não foi possível identificar o vencimento automaticamente nos arquivos selecionados.');
      }
    } catch (error) {
      console.error("Erro na detecção:", error);
      toast.error('Erro ao tentar detectar o vencimento.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName || !newCompanyCnpj) return;
    try {
      await supabase.from('companies').insert([{
        name: newCompanyName,
        cnpj: newCompanyCnpj
      }]);
      setNewCompanyName('');
      setNewCompanyCnpj('');
      fetchData();
      toast.success('Empresa cadastrada com sucesso!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Cadastro de Empresa',
        details: JSON.stringify({ name: newCompanyName, cnpj: newCompanyCnpj }),
        type: 'company_create'
      });
    } catch (error) {
      console.error("Error adding company:", error);
      toast.error('Erro ao cadastrar empresa.');
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId || !selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    try {
      const company = companies.find(c => c.id === selectedCompanyId);
      if (!company) {
        toast.error('Empresa não encontrada.');
        setUploading(false);
        return;
      }

      const isFinancial = FINANCIAL_TYPES.includes(fileType);
      const [year, month] = isFinancial ? [new Date().getFullYear().toString(), (new Date().getMonth() + 1).toString().padStart(2, '0')] : period.split('-');
      const filesToUpload = Array.from(selectedFiles);
      
      toast.info(`Iniciando upload de ${filesToUpload.length} arquivos...`);

      for (const fileObj of filesToUpload) {
        const file = fileObj as File;
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileName = (file as any).webkitRelativePath || file.name;
        const storagePath = `empresas/${selectedCompanyId}/${year}/${month}/${fileType.toLowerCase()}s/${timestamp}_${randomSuffix}_${file.name}`;

        console.log(`Fazendo upload de ${file.name} para ${storagePath}...`);
        
        const { error: uploadErr } = await supabase.storage
          .from('files')
          .upload(storagePath, file);

        if (uploadErr) {
          console.error(`Erro no upload de ${file.name}:`, uploadErr);
          throw uploadErr;
        }

        const fileDueDate = detectedDates[file.name] || dueDate;
        const fileCategory = fileType === 'FATURA' ? category : (isFinancial ? fileType : null);

        const { data: fileData, error: dbErr } = await supabase.from('files').insert([{
          company_id: selectedCompanyId,
          type: fileType,
          period: isFinancial ? '' : period,
          due_date: isFinancial ? fileDueDate : null,
          amount: isFinancial ? (parseFloat(amount) || 0) : null,
          category: fileCategory,
          status: isFinancial ? 'PENDING' : null,
          original_name: fileName,
          storage_path: storagePath,
          uploader_id: profile.id,
          upload_date: new Date().toISOString()
        }]).select().single();

        if (dbErr) throw dbErr;

        logAudit({
          user_id: profile.id,
          user_name: profile.name,
          action: 'Upload de Arquivo',
          details: JSON.stringify({ fileName: file.name, company: company.name }),
          type: 'upload'
        });

        // Notify all users of this company
        const companyUsers = users.filter(u => u.company_id === selectedCompanyId);
        for (const u of companyUsers) {
          sendNotification({
            user_id: u.id,
            title: 'Novo Documento Disponível',
            message: `Um novo documento (${fileType}) ${isFinancial ? `com vencimento em ${new Date(fileDueDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : `de ${period}`} foi enviado para sua empresa: ${file.name}`,
            link: '/dashboard'
          });
        }
      }

      setSelectedFiles(null);
      setDueDate('');
      setAmount('');
      setDetectedDates({});
      setPeriod(new Date().toISOString().substring(0, 7));
      fetchData();
      toast.success(`${filesToUpload.length} arquivos enviados com sucesso!`);
    } catch (error: any) {
      console.error("Erro detalhado no upload:", error);
      toast.error('Erro ao fazer upload.');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateUserCompany = async (userId: string, companyId: string) => {
    try {
      await supabase
        .from('profiles')
        .update({ company_id: companyId })
        .eq('id', userId);
      
      fetchData();
      toast.success('Usuário vinculado com sucesso!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Vínculo de Usuário',
        details: JSON.stringify({ 
          user: users.find(u => u.id === userId)?.name, 
          company: companies.find(c => c.id === companyId)?.name 
        }),
        type: 'user_create'
      });
    } catch (error) {
      console.error("Error updating user company:", error);
      toast.error('Erro ao vincular usuário.');
    }
  };

  const handleMergeAndUpload = async () => {
    if (!assemblyCompanyId || assemblyFiles.length === 0 || !assemblyAmount || !assemblyDueDate) {
      toast.error('Preencha todos os campos e adicione pelo menos um arquivo.');
      return;
    }

    setIsMerging(true);
    try {
      const mergedPdf = await PDFDocument.create();
      
      for (const file of assemblyFiles) {
        const fileBytes = await file.arrayBuffer();
        const pdf = await PDFDocument.load(fileBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      console.log('PDF mesclado criado. Tamanho:', blob.size, 'bytes');

      if (blob.size === 0) {
        throw new Error('O PDF mesclado está vazio.');
      }

      const finalFileName = assemblyFileName.trim() 
        ? `${assemblyFileName.trim().replace(/\s+/g, '_')}_${Date.now()}.pdf`
        : `${assemblyFileType}_${assemblyCompanyId}_${Date.now()}.pdf`;
      
      const [year, month] = [new Date().getFullYear().toString(), (new Date().getMonth() + 1).toString().padStart(2, '0')];
      const storagePath = `empresas/${assemblyCompanyId}/${year}/${month}/${assemblyFileType.toLowerCase()}s/${finalFileName}`;

      console.log('Iniciando upload para:', storagePath);
      
      const { error: uploadErr } = await supabase.storage
        .from('files')
        .upload(storagePath, blob);

      if (uploadErr) throw uploadErr;

      const { data: fileData, error: dbErr } = await supabase.from('files').insert([{
        company_id: assemblyCompanyId,
        original_name: finalFileName,
        storage_path: storagePath,
        type: assemblyFileType,
        period: new Date().toISOString().slice(0, 7),
        uploader_id: profile.id,
        upload_date: new Date().toISOString(),
        status: 'PENDING',
        amount: parseFloat(assemblyAmount),
        due_date: assemblyDueDate,
        category: assemblyFileType === 'FATURA' ? 'Outros' : assemblyFileType
      }]).select().single();

      if (dbErr) throw dbErr;

      fetchData();

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: `Montagem de ${assemblyFileType}`,
        details: JSON.stringify({ 
          type: assemblyFileType, 
          company: companies.find(c => c.id === assemblyCompanyId)?.name 
        }),
        type: 'upload'
      });

      toast.success(`${assemblyFileType} montada e enviada com sucesso!`);
      setAssemblyFiles([]);
      setAssemblyAmount('');
      setAssemblyDueDate('');
      setAssemblyFileName('');
      setActiveTab('finance');
    } catch (error) {
      console.error('Erro ao montar fatura:', error);
      toast.error('Erro ao montar fatura.');
    } finally {
      setIsMerging(false);
    }
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...assemblyFiles];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFiles.length) return;
    
    [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
    setAssemblyFiles(newFiles);
  };

  const removeAssemblyFile = (index: number) => {
    setAssemblyFiles(prev => prev.filter((_, i) => i !== index));
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
      
      setSelectedFileIds(prev => prev.filter(id => id !== fileId));
      toast.success('Arquivo movido para a lixeira!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Mover para Lixeira',
        details: JSON.stringify({ name: originalName, id: fileId }),
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
        action: 'Recuperar Arquivo',
        details: JSON.stringify({ name: originalName, id: fileId }),
        type: 'update'
      });
    } catch (error) {
      console.error("Error recovering file:", error);
      toast.error('Erro ao recuperar arquivo.');
    }
  };

  const handlePermanentDeleteFile = async (fileId: string, storagePath: string, originalName: string) => {
    if (!window.confirm(`ATENÇÃO: Deseja excluir PERMANENTEMENTE o arquivo "${originalName}"? Esta ação não pode ser desfeita.`)) return;
    try {
      // Delete from Storage
      await supabase.storage.from('files').remove([storagePath]);
      
      // Delete from Database
      await supabase.from('files').delete().eq('id', fileId);
      
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setSelectedFileIds(prev => prev.filter(id => id !== fileId));
      toast.success('Arquivo excluído permanentemente!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Exclusão Permanente',
        details: JSON.stringify({ name: originalName, path: storagePath }),
        type: 'delete'
      });
    } catch (error) {
      console.error("Error permanently deleting file:", error);
      toast.error('Erro ao excluir arquivo permanentemente.');
    }
  };

  const handleUpdateDueDate = async (fileId: string, newDate: string) => {
    if (!newDate) return;
    try {
      await supabase
        .from('files')
        .update({ due_date: newDate })
        .eq('id', fileId);
      
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, due_date: newDate } : f));
      setEditingFileId(null);
      toast.success('Data de vencimento atualizada!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Atualização de Vencimento',
        details: JSON.stringify({ id: fileId, date: newDate }),
        type: 'update'
      });
    } catch (error) {
      console.error("Error updating due date:", error);
      toast.error('Erro ao atualizar data de vencimento.');
    }
  };

  const handleUpdateAmount = async (fileId: string, newAmount: string) => {
    const parsedAmount = parseFloat(newAmount);
    if (isNaN(parsedAmount)) return;
    try {
      await supabase
        .from('files')
        .update({ amount: parsedAmount })
        .eq('id', fileId);
      
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, amount: parsedAmount } : f));
      setEditingAmountId(null);
      toast.success('Valor atualizado!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Atualização de Valor',
        details: JSON.stringify({ id: fileId, amount: parsedAmount }),
        type: 'update'
      });
    } catch (error) {
      console.error("Error updating amount:", error);
      toast.error('Erro ao atualizar valor.');
    }
  };

  const handleUpdateStatus = async (fileId: string, newStatus: 'PENDING' | 'PAID' | 'CANCELLED', reason?: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'CANCELLED') {
        updateData.cancelled_at = new Date().toISOString();
        updateData.cancelled_by = profile.name;
        updateData.cancel_reason = reason;
      } else {
        // Clear cancellation data if reverting
        updateData.cancelled_at = null;
        updateData.cancelled_by = null;
        updateData.cancel_reason = null;
      }

      await supabase
        .from('files')
        .update(updateData)
        .eq('id', fileId);
      
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ...updateData } : f));
      
      let msg = 'Status atualizado!';
      if (newStatus === 'PAID') msg = 'Fatura liquidada com sucesso!';
      if (newStatus === 'PENDING') msg = 'Fatura retornada para pendente.';
      if (newStatus === 'CANCELLED') msg = 'Fatura cancelada.';
      
      toast.success(msg);
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Atualização de Status Financeiro',
        details: JSON.stringify({ id: fileId, status: newStatus, reason }),
        type: 'update'
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleCancelFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingFileId || !cancelReason.trim()) return;
    handleUpdateStatus(cancellingFileId, 'CANCELLED', cancelReason);
    setCancelModalOpen(false);
    setCancellingFileId(null);
    setCancelReason('');
  };

  const handleDeleteBatch = async () => {
    if (selectedFileIds.length === 0) return;
    if (!window.confirm(`Deseja mover os ${selectedFileIds.length} arquivos selecionados para a lixeira?`)) return;

    setLoading(true);
    try {
      const deletedAt = new Date().toISOString();
      // Shim UPDATE only suporta .eq('id', ...) — fazemos um update por id em paralelo.
      const results = await Promise.all(selectedFileIds.map(id =>
        supabase
          .from('files')
          .update({
            is_deleted: true,
            deleted_at: deletedAt,
            deleted_by: profile.name
          })
          .eq('id', id)
      ));
      const failed = results.filter((r: any) => r?.error).length;
      if (failed > 0) {
        throw new Error(`${failed} arquivo(s) não puderam ser atualizados`);
      }

      setFiles(prev => prev.map(f => selectedFileIds.includes(f.id) ? { 
        ...f, 
        is_deleted: true, 
        deleted_at: deletedAt, 
        deleted_by: profile.name 
      } : f));

      toast.success(`${selectedFileIds.length} arquivos movidos para a lixeira!`);
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Exclusão em Lote (Lixeira)',
        details: JSON.stringify({ count: selectedFileIds.length }),
        type: 'delete'
      });
      setSelectedFileIds([]);
    } catch (error) {
      console.error("Error in batch delete:", error);
      toast.error('Erro ao excluir arquivos em lote.');
    } finally {
      setLoading(false);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId) 
        : [...prev, fileId]
    );
  };

  const toggleSelectAll = (filteredFiles: FiscalFile[]) => {
    if (selectedFileIds.length === filteredFiles.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(filteredFiles.map(f => f.id));
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserName || !newUserPassword) return;
    if (newUserPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setUploading(true); // Reuse uploading state for loading feedback
    try {
      const { data: invokeData, error: invokeError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newUserEmail,
          password: newUserPassword,
          name: newUserName,
          role: newUserRole,
          company_id: (newUserRole === 'client' || newUserRole === 'reservations') ? newUserCompanyId : null,
          permissions: newUserPermissions,
        },
      });

      if (invokeError) {
        throw new Error((invokeError as any)?.context?.error || invokeError.message || 'Erro ao cadastrar usuário');
      }
      if (invokeData && (invokeData as any).error) {
        throw new Error((invokeData as any).error);
      }

      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserRole('client');
      setNewUserCompanyId('');
      setNewUserPermissions(DEFAULT_PERMISSIONS['client']);
      fetchData();
      toast.success('Usuário cadastrado com sucesso!');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Cadastro de Usuário',
        details: JSON.stringify({ name: newUserName, email: newUserEmail, role: newUserRole }),
        type: 'user_create'
      });
    } catch (error: any) {
      console.error("Error adding user:", error);
      toast.error(error.message || 'Erro ao cadastrar usuário.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  const financeStats = (() => {
    const faturas = files.filter(f => FINANCIAL_TYPES.includes(f.type) && !f.is_deleted);
    const trashFaturas = files.filter(f => FINANCIAL_TYPES.includes(f.type) && f.is_deleted);
    
    const isPending = (f: FiscalFile) => f.status === 'PENDING' || !f.status;
    const isPaid = (f: FiscalFile) => f.status === 'PAID';
    const isCancelled = (f: FiscalFile) => f.status === 'CANCELLED';
    
    const isOverdue = (f: FiscalFile) => {
      if (!isPending(f) || !f.due_date) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(f.due_date + 'T12:00:00');
      due.setHours(0, 0, 0, 0);
      return due < today;
    };

    const overdueFaturas = faturas.filter(f => isOverdue(f));
    const pendingFaturas = faturas.filter(f => isPending(f) && !isOverdue(f));
    const paidFaturas = faturas.filter(f => isPaid(f));
    const cancelledFaturas = faturas.filter(f => isCancelled(f));

    const totalPending = pendingFaturas.reduce((acc, f) => acc + (Number(f.amount) || 0), 0);
    const totalPaid = paidFaturas.reduce((acc, f) => acc + (Number(f.amount) || 0), 0);
    const totalOverdue = overdueFaturas.reduce((acc, f) => acc + (Number(f.amount) || 0), 0);
    const totalUnpaid = totalPending + totalOverdue;
    const unpaidCount = pendingFaturas.length + overdueFaturas.length;
    
    // Chart data: Group by month (excluding cancelled)
    const monthlyData: Record<string, { month: string, pending: number, paid: number }> = {};
    faturas.filter(f => !isCancelled(f)).forEach(f => {
      const date = f.due_date ? new Date(f.due_date + 'T12:00:00') : new Date(f.upload_date);
      const monthKey = date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { month: monthKey, pending: 0, paid: 0 };
      }
      if (f.status === 'PAID') {
        monthlyData[monthKey].paid += (Number(f.amount) || 0);
      } else {
        monthlyData[monthKey].pending += (Number(f.amount) || 0);
      }
    });

    const chartData = Object.values(monthlyData);

    // Category data
    const categoryMap: Record<string, number> = {};
    const cashFlowMap: Record<string, number> = {};

    faturas.filter(f => !isCancelled(f)).forEach(f => {
      const cat = f.category || 'Outros';
      categoryMap[cat] = (categoryMap[cat] || 0) + (Number(f.amount) || 0);

      if (f.dueDate) {
        cashFlowMap[f.dueDate] = (cashFlowMap[f.dueDate] || 0) + (Number(f.amount) || 0);
      }
    });

    const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));
    const cashFlowData = Object.entries(cashFlowMap)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const pendingDisputes = faturas.filter(f => f.disputeAt && !f.disputeResponse);

    // BI Stats
    const companyStats: Record<string, { 
      name: string, 
      totalAmount: number, 
      count: number, 
      paidCount: number,
      totalLeadTime: number,
      paidAmount: number
    }> = {};

    companies.forEach(c => {
      companyStats[c.id] = { name: c.name, totalAmount: 0, count: 0, paidCount: 0, totalLeadTime: 0, paidAmount: 0 };
    });

    faturas.forEach(f => {
      if (!companyStats[f.companyId]) return;
      companyStats[f.companyId].totalAmount += (Number(f.amount) || 0);
      companyStats[f.companyId].count += 1;
      
      if (f.status === 'PAID') {
        companyStats[f.companyId].paidCount += 1;
        companyStats[f.companyId].paidAmount += (Number(f.amount) || 0);
        
        if (f.dueDate && f.proofDate) {
          const due = new Date(f.dueDate + 'T12:00:00');
          const paid = new Date(f.proofDate);
          const diffDays = Math.floor((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
          companyStats[f.companyId].totalLeadTime += diffDays;
        }
      }
    });

    const biData = Object.entries(companyStats).map(([id, stats]) => ({
      id,
      name: stats.name,
      avgTicket: stats.count > 0 ? stats.totalAmount / stats.count : 0,
      avgLeadTime: stats.paidCount > 0 ? stats.totalLeadTime / stats.paidCount : 0,
      totalPaid: stats.paidAmount,
      paymentRate: stats.count > 0 ? (stats.paidCount / stats.count) * 100 : 0
    })).sort((a, b) => b.totalPaid - a.totalPaid);

    return {
      totalPending,
      totalPaid,
      totalOverdue,
      totalUnpaid,
      unpaidCount,
      overdueCount: overdueFaturas.length,
      pendingCount: pendingFaturas.length,
      paidCount: paidFaturas.length,
      cancelledCount: cancelledFaturas.length,
      trashCount: trashFaturas.length,
      disputeCount: pendingDisputes.length,
      chartData: chartData.slice(-6),
      categoryData,
      cashFlowData,
      biData
    };
  })();

  const canSeeStats = profile.role === 'admin' || profile.role === 'finance' || profile.role === 'faturamento';

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard Administrativo</h1>
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all relative"
          >
            <Bell className="w-5 h-5 text-neutral-600" />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-neutral-100 z-50 overflow-hidden"
              >
                <div className="p-4 border-b border-neutral-100 flex justify-between items-center">
                  <h3 className="font-bold text-sm">Notificações</h3>
                  <span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded-full font-bold">
                    {notifications.filter(n => !n.read).length} Novas
                  </span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.length > 0 ? (
                    notifications.map(n => (
                      <div 
                        key={n.id} 
                        className={`p-4 border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer ${!n.read ? 'bg-blue-50/30' : ''}`}
                        onClick={() => markNotificationRead(n.id)}
                      >
                        <p className="text-xs font-bold text-neutral-900">{n.title}</p>
                        <p className="text-xs text-neutral-500 mt-1">{n.message}</p>
                        <p className="text-[10px] text-neutral-400 mt-2">
                          {new Date(n.timestamp).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-neutral-400">
                      <BellOff className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">Nenhuma notificação</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {canSeeStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Empresas', value: companies.length, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Documentos', value: files.length, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Clientes', value: users.filter(u => u.role === 'client').length, icon: Users, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Contestações', value: financeStats.disputeCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Visualizados', value: files.filter(f => f.viewed_by_client).length, icon: CheckCircle2, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm flex items-center gap-4"
            >
              <div className={`p-3 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-bold text-neutral-900">{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {((profile.role === 'admin' || profile.role === 'faturamento' || profile.role === 'finance' || profile.role === 'reservations' || profile.permissions?.canViewTariffs) && ['documents', 'banks', 'finance', 'bi', 'assembly', 'tariffs', 'registration', 'companies', 'users'].includes(initialTab)) && (
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit mb-6">
        {/* Sub-tabs for main "Finance" context */}
        {initialTab === 'finance' && (
          <button
            onClick={() => setActiveTab('finance')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'finance' 
                ? 'bg-white text-neutral-900 shadow-sm' 
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Gestão Financeira
          </button>
        )}

        {/* Sub-tabs for "Empresas" context */}
        {initialTab === 'companies' && (
          <>
            <button
              onClick={() => setActiveTab('documents')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'documents' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Faturas & Arquivos
            </button>
            <button
              onClick={() => setActiveTab('registration')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'registration' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Cadastro
            </button>
            <button
              onClick={() => setActiveTab('companies')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'companies' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Empresas
            </button>
            <button
              onClick={() => setActiveTab('tariffs')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'tariffs' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Tarifário
            </button>
          </>
        )}

        {/* Sub-tabs for "Cadastro" context */}
        {initialTab === 'registration' && (
          <>
            <button
              onClick={() => setActiveTab('registration')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'registration' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Cadastro
            </button>
            <button
              onClick={() => setActiveTab('companies')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'companies' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Empresas
            </button>
            <button
              onClick={() => setActiveTab('banks')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'banks' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Contas Bancárias
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'users' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Equipe
            </button>
            <button
              onClick={() => setActiveTab('tariffs')}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'tariffs' 
                  ? 'bg-white text-neutral-900 shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Tarifário
            </button>
          </>
        )}
      </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'documents' ? (
          <motion.div
            key="documents"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
        {/* Left Column: Management */}
        <div className="space-y-8">
        {/* Upload Files */}
        <motion.section 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-5 h-5 text-neutral-900" />
            <h2 className="font-bold text-neutral-900">Upload de Documentos</h2>
          </div>
          <form onSubmit={handleUpload} className="space-y-4">
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">Selecionar Empresa</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={fileType}
                onChange={(e) => setFileType(e.target.value as any)}
                className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="NF">NF</option>
                <option value="DANFE">DANFE</option>
                <option value="EXTRATO">EXTRATO</option>
                <option value="FATURA">FATURA</option>
                <option value="Hospedagem">Hospedagem</option>
                <option value="Alimentação">Alimentação</option>
                <option value="Lavanderia">Lavanderia</option>
                <option value="Eventos">Eventos</option>
                <option value="Transporte">Transporte</option>
                <option value="OUTRO">OUTRO</option>
              </select>
              {FINANCIAL_TYPES.includes(fileType) ? (
                <div className="space-y-2">
                  {fileType === 'FATURA' && (
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="Hospedagem">Hospedagem</option>
                      <option value="Alimentação">Alimentação</option>
                      <option value="Lavanderia">Lavanderia</option>
                      <option value="Eventos">Eventos</option>
                      <option value="Transporte">Transporte</option>
                      <option value="Outros">Outros</option>
                    </select>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="flex-1 px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
                      placeholder="Vencimento"
                    />
                    <button
                      type="button"
                      onClick={handleDetectDueDate}
                      disabled={isDetecting || !selectedFiles}
                      className="px-3 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 flex items-center gap-2"
                      title="Detectar vencimento automaticamente"
                    >
                      {isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
                      <span className="text-xs font-medium">Detectar</span>
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
                      placeholder="Valor da Fatura"
                    />
                  </div>
                </div>
              ) : (
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-neutral-900"
                />
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="folderUpload"
                checked={isFolderUpload}
                onChange={(e) => {
                  setIsFolderUpload(e.target.checked);
                  setSelectedFiles(null);
                  setDetectedDates({});
                }}
                className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
              />
              <label htmlFor="folderUpload" className="text-xs font-medium text-neutral-700 cursor-pointer">
                Fazer upload de pasta inteira
              </label>
            </div>
            <input
              key={isFolderUpload ? 'folder' : 'file'}
              type="file"
              multiple={!isFolderUpload}
              {...(isFolderUpload ? { webkitdirectory: "", directory: "" } : {})}
              onChange={(e) => {
                setSelectedFiles(e.target.files);
                setDetectedDates({});
              }}
              className="w-full text-sm text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-neutral-100 file:text-neutral-700 hover:file:bg-neutral-200"
            />
            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-neutral-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploading ? 'Enviando...' : (
                <>
                  <Upload className="w-4 h-4" />
                  Fazer Upload
                </>
              )}
            </button>
          </form>
        </motion.section>
        </div>


      {/* Right Column: File List & Audit Log */}
      <div className="lg:col-span-2 space-y-6">
        {isVoucherModalOpen && (
          <VoucherModal 
            company={companies.find(c => c.id === files.find(f => selectedFileIds.includes(f.id))?.companyId)!}
            selectedFiles={files.filter(f => selectedFileIds.includes(f.id))}
            onClose={() => setIsVoucherModalOpen(false)}
          />
        )}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden"
        >
          <div className="p-6 border-b border-neutral-100 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-neutral-900" />
                  <h2 className="font-bold text-neutral-900">Documentos Enviados</h2>
                </div>
                <div className="flex bg-neutral-100 p-1 rounded-lg">
                  {[
                    { id: 'all', label: 'Ativos' },
                    { id: 'trash', label: 'Lixeira' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setDocumentsSubTab(tab.id as any)}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                        documentsSubTab === tab.id 
                          ? 'bg-white text-neutral-900 shadow-sm' 
                          : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs text-neutral-500 whitespace-nowrap">
                {files.filter(file => {
                  const matchesCompany = !filterCompanyId || file.companyId === filterCompanyId;
                  const matchesType = !filterFileType || file.type === filterFileType;
                  const matchesSearch = !searchTerm || file.originalName.toLowerCase().includes(searchTerm.toLowerCase());
                  return matchesCompany && matchesType && matchesSearch;
                }).length} arquivos encontrados
              </div>
            </div>

            {selectedFileIds.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between bg-neutral-50 p-3 rounded-lg border border-neutral-200"
              >
                <span className="text-xs font-bold text-neutral-700">
                  {selectedFileIds.length} arquivos selecionados
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const selectedFilesForVoucher = files.filter(f => selectedFileIds.includes(f.id));
                      const sameCompany = selectedFilesForVoucher.every(f => f.companyId === selectedFilesForVoucher[0]?.companyId);
                      
                      if (!sameCompany) {
                        toast.error('Selecione apenas arquivos da mesma empresa para gerar o voucher.');
                        return;
                      }
                      
                      setIsVoucherModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-amber-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors shadow-sm"
                  >
                    <FileText className="w-3 h-3" />
                    Gerar Voucher
                  </button>
                  <button
                    onClick={handleDeleteBatch}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
                  >
                    <Trash2 className="w-3 h-3" />
                    Excluir Selecionados
                  </button>
                </div>
              </motion.div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Buscar arquivo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
                />
              </div>
              <select
                value={filterCompanyId}
                onChange={(e) => setFilterCompanyId(e.target.value)}
                className="px-3 py-2 border border-neutral-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
              >
                <option value="">Todas as Empresas</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={filterFileType}
                onChange={(e) => setFilterFileType(e.target.value)}
                className="px-3 py-2 border border-neutral-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
              >
                <option value="">Todos os Tipos</option>
                <option value="NF">NF</option>
                <option value="DANFE">DANFE</option>
                <option value="EXTRATO">EXTRATO</option>
                <option value="FATURA">FATURA</option>
                <option value="Hospedagem">Hospedagem</option>
                <option value="Alimentação">Alimentação</option>
                <option value="Lavanderia">Lavanderia</option>
                <option value="Eventos">Eventos</option>
                <option value="Fatura Evento">Fatura Evento</option>
                <option value="Transporte">Transporte</option>
                <option value="OUTRO">OUTRO</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-medium w-10">
                    <input
                      type="checkbox"
                      checked={
                        files.filter(file => {
                          const matchesCompany = !filterCompanyId || file.companyId === filterCompanyId;
                          const matchesType = !filterFileType || file.type === filterFileType;
                          const matchesSearch = !searchTerm || file.originalName.toLowerCase().includes(searchTerm.toLowerCase());
                          return matchesCompany && matchesType && matchesSearch;
                        }).length > 0 && 
                        selectedFileIds.length === files.filter(file => {
                          if (documentsSubTab === 'trash') return file.is_deleted;
                          if (file.is_deleted) return false;
                          const matchesCompany = !filterCompanyId || file.companyId === filterCompanyId;
                          const matchesType = !filterFileType || file.type === filterFileType;
                          const matchesSearch = !searchTerm || file.originalName.toLowerCase().includes(searchTerm.toLowerCase());
                          return matchesCompany && matchesType && matchesSearch;
                        }).length
                      }
                      onChange={() => toggleSelectAll(
                        files.filter(file => {
                          if (documentsSubTab === 'trash') return file.is_deleted;
                          if (file.is_deleted) return false;
                          const matchesCompany = !filterCompanyId || file.companyId === filterCompanyId;
                          const matchesType = !filterFileType || file.type === filterFileType;
                          const matchesSearch = !searchTerm || file.originalName.toLowerCase().includes(searchTerm.toLowerCase());
                          return matchesCompany && matchesType && matchesSearch;
                        })
                      )}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                    />
                  </th>
                  <th className="px-6 py-3 font-medium">Empresa</th>
                  <th className="px-6 py-3 font-medium">Tipo</th>
                  <th className="px-6 py-3 font-medium">Arquivo</th>
                  <th className="px-6 py-3 font-medium">Vencimento/Comp.</th>
                  <th className="px-6 py-3 font-medium text-center">Valor</th>
                  <th className="px-6 py-3 font-medium text-center">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {files
                  .filter(file => {
                    if (documentsSubTab === 'trash') return file.is_deleted;
                    if (file.is_deleted) return false;
                    const matchesCompany = !filterCompanyId || file.companyId === filterCompanyId;
                    const matchesType = !filterFileType || file.type === filterFileType;
                    const matchesSearch = !searchTerm || file.originalName.toLowerCase().includes(searchTerm.toLowerCase());
                    return matchesCompany && matchesType && matchesSearch;
                  })
                  .map(file => (
                  <tr key={file.id} data-focus-id={file.id} className={`hover:bg-neutral-50 transition-colors ${selectedFileIds.includes(file.id) ? 'bg-neutral-50' : ''}`}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedFileIds.includes(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                        className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-900">
                      <div className="font-medium">{companies.find(c => c.id === file.companyId)?.name || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="px-2 py-1 bg-neutral-100 rounded text-[10px] font-bold text-neutral-600 uppercase">
                        {file.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-900 truncate max-w-[150px]" title={file.originalName}>
                      {file.originalName}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {FINANCIAL_TYPES.includes(file.type) ? (
                        <div className="flex flex-col gap-1">
                          {editingFileId === file.id ? (
                            <div className="flex items-center gap-1">
                              <input 
                                type="date" 
                                value={tempDueDate}
                                onChange={(e) => setTempDueDate(e.target.value)}
                                className="text-[10px] p-1 border border-neutral-300 rounded outline-none focus:ring-1 focus:ring-amber-500"
                              />
                              <button 
                                onClick={() => handleUpdateDueDate(file.id, tempDueDate)}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={() => setEditingFileId(null)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                              >
                                <CloseIcon className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-neutral-700">
                                  {file.dueDate ? new Date(file.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem Vencimento'}
                                </span>
                                {file.dueDate && (() => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  const due = new Date(file.dueDate + 'T12:00:00');
                                  due.setHours(0, 0, 0, 0);
                                  
                                  if (due < today) return <span className="text-[10px] font-bold text-red-500 uppercase">Vencida</span>;
                                  if (due.getTime() === today.getTime()) return <span className="text-[10px] font-bold text-amber-500 uppercase">Vence Hoje</span>;
                                  return <span className="text-[10px] font-bold text-green-500 uppercase">A Vencer</span>;
                                })()}
                              </div>
                              <button 
                                onClick={() => {
                                  setEditingFileId(file.id);
                                  setTempDueDate(file.dueDate || '');
                                }}
                                className="p-1 text-neutral-400 hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-all"
                                title="Editar Vencimento"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-500">{file.period || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {FINANCIAL_TYPES.includes(file.type) ? (
                        <div className="flex flex-col gap-1">
                          {editingAmountId === file.id ? (
                            <div className="flex items-center gap-1">
                              <input 
                                type="number" 
                                step="0.01"
                                value={tempAmount}
                                onChange={(e) => setTempAmount(e.target.value)}
                                className="text-[10px] p-1 border border-neutral-300 rounded outline-none focus:ring-1 focus:ring-amber-500 w-20"
                              />
                              <button 
                                onClick={() => handleUpdateAmount(file.id, tempAmount)}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={() => setEditingAmountId(null)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                              >
                                <CloseIcon className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <span className="text-xs font-bold text-neutral-700">
                                {file.amount ? file.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}
                              </span>
                              <button 
                                onClick={() => {
                                  setEditingAmountId(file.id);
                                  setTempAmount(file.amount?.toString() || '');
                                }}
                                className="p-1 text-neutral-400 hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-all"
                                title="Editar Valor"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {file.is_deleted ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-red-600 uppercase">Excluído</span>
                          <span className="text-[9px] text-neutral-400">Por: {file.deletedBy || 'N/A'}</span>
                          <span className="text-[9px] text-neutral-400">Em: {file.deletedAt ? new Date(file.deletedAt).toLocaleDateString('pt-BR') : 'N/A'}</span>
                        </div>
                      ) : FINANCIAL_TYPES.includes(file.type) ? (
                        <button
                          onClick={() => handleUpdateStatus(file.id, file.status === 'PAID' ? 'PENDING' : 'PAID')}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase transition-colors ${
                            file.status === 'PAID' 
                              ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          }`}
                        >
                          {file.status === 'PAID' ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              Pago
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3" />
                              Pendente
                            </>
                          )}
                        </button>
                      ) : (
                        file.viewed_by_client ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-3 h-3" />
                            <span className="text-[10px] font-medium">Visualizado</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-500">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px] font-medium">Pendente</span>
                          </div>
                        )
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {file.is_deleted ? (
                          <>
                            <button
                              onClick={() => handleRecoverFile(file.id, file.original_name)}
                              className="p-2 text-neutral-400 hover:text-green-600 transition-colors"
                              title="Recuperar Arquivo"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePermanentDeleteFile(file.id, file.storage_path, file.original_name)}
                              className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                              title="Excluir Permanentemente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            {file.download_url && (
                              <a
                                href={file.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors inline-block"
                                title="Baixar Arquivo"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              onClick={() => handleMoveToTrash(file.id, file.original_name)}
                              className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                              title="Mover para Lixeira"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {files.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-neutral-500 text-sm">
                      Nenhum arquivo encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </motion.div>
    ) : activeTab === 'registration' ? (
      <motion.div
        key="registration"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-8"
      >
        <div className="space-y-8">
          {/* Add Company */}
          <motion.section 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-neutral-900" />
              <h2 className="font-bold text-neutral-900">Cadastrar Empresa</h2>
            </div>
            <form onSubmit={handleAddCompany} className="space-y-4">
              <input
                type="text"
                placeholder="Nome da Empresa"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <input
                type="text"
                placeholder="CNPJ"
                value={newCompanyCnpj}
                onChange={(e) => setNewCompanyCnpj(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <button
                type="submit"
                className="w-full bg-neutral-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Empresa
              </button>
            </form>
          </motion.section>

          {/* User Management */}
          <motion.section 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-neutral-900" />
              <h2 className="font-bold text-neutral-900">Cadastrar Usuário</h2>
            </div>
            <form onSubmit={handleAddUser} className="space-y-4">
              <input
                type="text"
                placeholder="Nome Completo"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <input
                type="email"
                placeholder="E-mail"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <input
                type="password"
                placeholder="Senha (mín. 6 caracteres)"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newUserRole}
                  onChange={(e) => {
                    const role = e.target.value as UserRole;
                    setNewUserRole(role);
                    setNewUserPermissions(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS['client']);
                  }}
                  className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="client">Cliente</option>
                  <option value="reservations">Reservas</option>
                  <option value="faturamento">Faturamento</option>
                  <option value="finance">Financeiro</option>
                  <option value="reception">Recepção</option>
                  <option value="admin">Admin</option>
                </select>
                {(newUserRole === 'client' || newUserRole === 'reservations') && (
                  <select
                    value={newUserCompanyId}
                    onChange={(e) => setNewUserCompanyId(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="">Sem Empresa</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="border border-neutral-200 rounded-lg p-3">
                <PermissionsSelector
                  permissions={newUserPermissions}
                  onChange={setNewUserPermissions}
                  role={newUserRole}
                />
              </div>
              <button
                type="submit"
                className="w-full bg-neutral-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Cadastrar Usuário
              </button>
            </form>
          </motion.section>
        </div>

        <div className="space-y-8">
          {/* Vincular Clientes */}
          <motion.section 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-neutral-900" />
              <h2 className="font-bold text-neutral-900">Vincular Clientes</h2>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="w-full pl-8 pr-4 py-1.5 border border-neutral-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-neutral-900 bg-neutral-50"
              />
            </div>
            <p className="text-xs text-neutral-500 mb-4">
              Selecione uma empresa para cada cliente cadastrado.
            </p>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {users
                .filter(u => u.role === 'client')
                .filter(u => !userSearchTerm || u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) || u.email.toLowerCase().includes(userSearchTerm.toLowerCase()))
                .map(user => (
                <div key={user.id} className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                  <div className="mb-2">
                    <p className="text-sm font-medium text-neutral-900">{user.name}</p>
                    <p className="text-xs text-neutral-500">{user.email}</p>
                  </div>
                  <select
                    value={user.company_id || ''}
                    onChange={(e) => handleUpdateUserCompany(user.id, e.target.value)}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="">Sem Empresa</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              ))}
              {users.filter(u => u.role === 'client').length === 0 && (
                <p className="text-xs text-center text-neutral-400 py-4">Nenhum cliente cadastrado ainda.</p>
              )}
            </div>
          </motion.section>
        </div>
      </motion.div>
    ) : activeTab === 'banks' ? (
      <motion.div
        key="banks"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <BankAccountsManager />
      </motion.div>
    ) : activeTab === 'finance' ? (
      <motion.div
        key="finance"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="space-y-6"
      >
        {/* Finance Sub-navigation */}
        <div className="flex gap-2 p-1 bg-white border border-neutral-200 rounded-xl w-fit shadow-sm">
          {[
            { id: 'overview', label: 'Visão Geral', icon: BarChartIcon },
            { id: 'baixa', label: 'Baixa de Pagamento', icon: CheckCircle },
            { id: 'itau', label: 'Extração Itaú', icon: Sparkles },
            { id: 'extratos', label: 'Extratos', icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFinanceMainTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                financeMainTab === tab.id 
                  ? 'bg-neutral-900 text-white shadow-md' 
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {financeMainTab === 'overview' ? (
          <div className="space-y-8">
            {/* Meta Mensal — somente Admin */}
            {profile.role === 'admin' && (
              <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 uppercase">Meta de Receita Mensal</h3>
                    <p className="text-xs text-neutral-500 mt-1">
                      Meta atual: <span className="font-bold text-neutral-900">{monthlyGoal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </p>
                  </div>
                  <DollarSign className="w-5 h-5 text-neutral-400" />
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase block mb-1">Nova Meta (R$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={monthlyGoalInput}
                      onChange={(e) => setMonthlyGoalInput(e.target.value)}
                      placeholder="Ex.: 150000 ou 150.000,00"
                      className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <button
                    onClick={handleSaveMonthlyGoal}
                    disabled={savingGoal || !monthlyGoalInput.trim()}
                    className="px-5 py-2 bg-neutral-900 text-white text-sm font-bold rounded-xl hover:bg-neutral-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingGoal ? 'Salvando...' : 'Salvar Meta'}
                  </button>
                </div>
              </div>
            )}

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <h3 className="text-sm font-bold text-neutral-900 uppercase mb-6">Distribuição por Categoria</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={financeStats.categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {financeStats.categoryData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <h3 className="text-sm font-bold text-neutral-900 uppercase mb-6">Fluxo de Caixa (Vencimentos)</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={financeStats.cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    fontSize={10}
                    tickFormatter={(str) => new Date(str).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  />
                  <YAxis 
                    fontSize={10}
                    tickFormatter={(value) => `R$ ${value}`}
                  />
                  <Tooltip 
                    formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  />
                  <Line type="monotone" dataKey="amount" stroke="#141414" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Finance Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-xs font-bold text-neutral-500 uppercase">Total Pendente</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900">
              {financeStats.totalUnpaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[10px] text-neutral-500 mt-1">{financeStats.unpaidCount} faturas aguardando</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <span className="text-xs font-bold text-neutral-500 uppercase">Total Vencido</span>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {financeStats.totalOverdue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[10px] text-red-500 mt-1">{financeStats.overdueCount} faturas atrasadas</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-xs font-bold text-neutral-500 uppercase">Total Pago</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {financeStats.totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[10px] text-green-500 mt-1">{financeStats.paidCount} faturas liquidadas</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-bold text-neutral-500 uppercase">Projeção Mensal</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900">
              {(financeStats.totalPending + financeStats.totalPaid).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[10px] text-neutral-500 mt-1">Volume total identificado</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Cash Flow Chart */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <BarChartIcon className="w-5 h-5 text-neutral-900" />
              <h3 className="font-bold text-neutral-900">Fluxo de Faturamento</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financeStats.chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `R$ ${value}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                  <Bar dataKey="paid" name="Pago" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pendente" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status Distribution */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <PieChartIcon className="w-5 h-5 text-neutral-900" />
              <h3 className="font-bold text-neutral-900">Distribuição por Status</h3>
            </div>
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Pago', value: financeStats.paidCount },
                      { name: 'Pendente', value: financeStats.pendingCount },
                      { name: 'Vencido', value: financeStats.overdueCount },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Detailed Finance Table */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-neutral-100 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h3 className="font-bold text-neutral-900">Detalhamento de Faturas</h3>
              
              {/* Sub-tabs */}
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="flex bg-neutral-100 p-1 rounded-lg">
                  {[
                    { id: 'pending', label: 'Pendentes', count: financeStats.pendingCount + financeStats.overdueCount },
                    { id: 'paid', label: 'Pagas', count: financeStats.paidCount },
                    { id: 'disputed', label: 'Contestadas', count: financeStats.disputeCount },
                    { id: 'cancelled', label: 'Canceladas', count: financeStats.cancelledCount },
                    { id: 'trash', label: 'Lixeira', count: financeStats.trashCount }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setFinanceSubTab(tab.id as any)}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
                        financeSubTab === tab.id 
                          ? 'bg-white text-neutral-900 shadow-sm' 
                          : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                    >
                      {tab.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                        financeSubTab === tab.id ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-600'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                    const invoices = files.filter(f => FINANCIAL_TYPES.includes(f.type) && !f.is_deleted);
                    const csvContent = [
                      ['Empresa', 'Categoria', 'Vencimento', 'Valor', 'Status'].join(','),
                      ...invoices.map(inv => [
                        companies.find(c => c.id === inv.companyId)?.name || 'N/A',
                        inv.category || 'Outros',
                        inv.dueDate || 'N/A',
                        inv.amount || 0,
                        inv.status
                      ].join(','))
                    ].join('\n');
                    
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.setAttribute('download', `financeiro_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm hover:bg-neutral-800 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Exportar CSV
                </button>
              </div>
            </div>
          </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Buscar por fatura ou arquivo..."
                  value={financeSearchTerm}
                  onChange={(e) => setFinanceSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
                />
              </div>
              <select
                value={financeCompanyFilter}
                onChange={(e) => setFinanceCompanyFilter(e.target.value)}
                className="px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
              >
                <option value="">Todas as Empresas</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={financeCategoryFilter}
                onChange={(e) => setFinanceCategoryFilter(e.target.value)}
                className="px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/5 transition-all"
              >
                <option value="">Todas as Categorias</option>
                <option value="Hospedagem">Hospedagem</option>
                <option value="Alimentação">Alimentação</option>
                <option value="Lavanderia">Lavanderia</option>
                <option value="Eventos">Eventos</option>
                <option value="Fatura Evento">Fatura Evento</option>
                <option value="Transporte">Transporte</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-neutral-50 text-neutral-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Empresa</th>
                  <th className="px-6 py-3">Categoria</th>
                  <th className="px-6 py-3">Arquivo / Fatura</th>
                  <th className="px-6 py-3">Vencimento</th>
                  <th className="px-6 py-3 text-right">Valor</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-center">Régua</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {files
                  .filter(f => FINANCIAL_TYPES.includes(f.type))
                  .filter(f => {
                    if (financeSubTab === 'trash') return f.is_deleted;
                    if (f.is_deleted) return false;
                    if (financeSubTab === 'pending') return f.status === 'PENDING' || !f.status;
                    if (financeSubTab === 'paid') return f.status === 'PAID';
                    if (financeSubTab === 'cancelled') return f.status === 'CANCELLED';
                    if (financeSubTab === 'disputed') return f.disputeAt && !f.disputeResponse;
                    return true;
                  })
                  .filter(f => {
                    const matchesSearch = f.originalName.toLowerCase().includes(financeSearchTerm.toLowerCase());
                    const matchesCompany = !financeCompanyFilter || f.companyId === financeCompanyFilter;
                    const matchesCategory = !financeCategoryFilter || f.category === financeCategoryFilter;
                    return matchesSearch && matchesCompany && matchesCategory;
                  })
                  .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))
                  .map(file => (
                  <tr key={file.id} data-focus-id={file.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-neutral-900">
                        {companies.find(c => c.id === file.companyId)?.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded-md text-[10px] font-bold uppercase">
                        {file.category || 'Outros'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-neutral-400" />
                        <span className="text-sm text-neutral-600 truncate max-w-[200px]" title={file.originalName}>
                          {file.originalName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {file.dueDate ? new Date(file.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-neutral-900 text-right">
                      {file.amount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-6 py-4">
                      {file.is_deleted ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-red-600">Excluído</span>
                          <span className="text-[10px] text-neutral-400">Por: {file.deletedBy || 'N/A'}</span>
                          <span className="text-[10px] text-neutral-400">Em: {file.deletedAt ? new Date(file.deletedAt).toLocaleDateString('pt-BR') : 'N/A'}</span>
                        </div>
                      ) : (
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                          file.status === 'PAID' ? 'bg-green-100 text-green-700' : 
                          file.status === 'CANCELLED' ? 'bg-neutral-100 text-neutral-500' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {file.status === 'PAID' ? 'Pago' : 
                           file.status === 'CANCELLED' ? 'Cancelado' : 'Pendente'}
                        </span>
                      )}
                      {file.status === 'CANCELLED' && (
                        <div className="mt-1 space-y-0.5">
                          {file.cancelReason && (
                            <div className="text-[9px] text-neutral-400 italic" title={file.cancelReason}>
                              Motivo: {file.cancelReason.substring(0, 30)}...
                            </div>
                          )}
                          <div className="text-[8px] text-neutral-400">
                            Por: {file.cancelledBy || 'N/A'}
                          </div>
                          {file.cancelledAt && (
                            <div className="text-[8px] text-neutral-400">
                              Em: {new Date(file.cancelledAt).toLocaleDateString('pt-BR')}
                            </div>
                          )}
                        </div>
                      )}
                      {file.proofUrl && (
                        <button 
                          onClick={() => setViewingFileDetails(file)}
                          className="mt-1 flex items-center gap-1 text-[9px] text-green-600 font-bold uppercase bg-green-50 px-1.5 py-0.5 rounded mx-auto hover:bg-green-100 transition-colors"
                        >
                          <Receipt className="w-2.5 h-2.5" />
                          Comprovante
                        </button>
                      )}
                      {file.dispute_at && (
                        <button 
                          onClick={() => setViewingFileDetails(file)}
                          className="mt-1 flex items-center gap-1 text-[9px] text-red-600 font-bold uppercase bg-red-50 px-1.5 py-0.5 rounded mx-auto hover:bg-red-100 transition-colors"
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Contestada
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {['D-3', 'D-0', 'D+2'].map(rule => {
                          const sent = file.billing_notifications_sent?.includes(rule);
                          return (
                            <span 
                              key={rule}
                              className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${
                                sent ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-neutral-100 text-neutral-400'
                              }`}
                              title={sent ? `Notificação ${rule} enviada` : `Notificação ${rule} pendente`}
                            >
                              {rule}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {file.is_deleted ? (
                          <>
                            <button
                              onClick={() => handleRecoverFile(file.id, file.original_name)}
                              className="p-2 text-neutral-400 hover:text-green-600 transition-colors"
                              title="Recuperar Fatura"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePermanentDeleteFile(file.id, file.storage_path, file.original_name)}
                              className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                              title="Excluir Permanentemente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            {file.status === 'PAID' ? (
                              <button
                                onClick={() => handleUpdateStatus(file.id, 'PENDING')}
                                className="p-2 text-neutral-400 hover:text-amber-600 transition-colors"
                                title="Reverter para Pendente"
                              >
                                <History className="w-4 h-4" />
                              </button>
                            ) : file.status === 'CANCELLED' ? (
                              <button
                                onClick={() => handleUpdateStatus(file.id, 'PENDING')}
                                className="p-2 text-neutral-400 hover:text-blue-600 transition-colors"
                                title="Recuperar Fatura"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(file.id, 'PAID')}
                                  className="p-2 text-neutral-400 hover:text-green-600 transition-colors"
                                  title="Dar Baixa (Pagar)"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setCancellingFileId(file.id);
                                    setCancelModalOpen(true);
                                  }}
                                  className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                                  title="Cancelar Fatura"
                                >
                                  <CloseIcon className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleMoveToTrash(file.id, file.original_name)}
                              className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                              title="Mover para Lixeira"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {file.download_url && (
                          <a
                            href={file.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors"
                            title="Ver Arquivo"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {files.filter(f => FINANCIAL_TYPES.includes(f.type)).length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-neutral-500 text-sm">
                      Nenhum documento financeiro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
        ) : financeMainTab === 'baixa' ? (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-neutral-100">
              <h3 className="font-bold text-neutral-900">Baixa Rápida de Pagamentos</h3>
              <p className="text-xs text-neutral-500">Selecione as faturas pendentes para dar baixa em lote ou individualmente.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-neutral-50 text-neutral-500 text-[10px] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Empresa</th>
                    <th className="px-6 py-3">Arquivo / Fatura</th>
                    <th className="px-6 py-3">Vencimento</th>
                    <th className="px-6 py-3 text-right">Valor</th>
                    <th className="px-6 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {files
                    .filter(f => FINANCIAL_TYPES.includes(f.type) && !f.is_deleted && (f.status === 'PENDING' || !f.status))
                    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
                    .map(file => (
                    <tr key={file.id} data-focus-id={file.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-neutral-900">
                          {companies.find(c => c.id === file.companyId)?.name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-neutral-600 truncate max-w-[200px]" title={file.originalName}>
                          {file.originalName}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600">
                        {file.dueDate ? new Date(file.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-neutral-900 text-right">
                        {file.amount?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleUpdateStatus(file.id, 'PAID')}
                          className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors flex items-center gap-1 ml-auto"
                        >
                          <Check className="w-3 h-3" />
                          Dar Baixa
                        </button>
                      </td>
                    </tr>
                  ))}
                  {files.filter(f => FINANCIAL_TYPES.includes(f.type) && !f.is_deleted && (f.status === 'PENDING' || !f.status)).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-neutral-500 text-sm">
                        Nenhuma fatura pendente encontrada para baixa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : financeMainTab === 'itau' ? (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-neutral-900">Extração de Dados Itaú</h3>
                <p className="text-sm text-neutral-500">Cole os dados do extrato (CTRL+V) para que o sistema decodifique e organize os pagamentos.</p>
              </div>
              
              <textarea
                value={itauRawText}
                onChange={(e) => setItauRawText(e.target.value)}
                placeholder="Cole aqui os dados do extrato do Itaú..."
                className="w-full h-48 p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-neutral-900/5 focus:outline-none font-mono"
              />

              <div className="flex justify-end gap-3">
                {itauExtractedData.length > 0 && (
                  <button
                    onClick={() => { setItauRawText(''); setItauExtractedData([]); }}
                    className="px-6 py-2 text-sm font-bold text-neutral-500 hover:text-neutral-700"
                  >
                    Limpar
                  </button>
                )}
                <button
                  onClick={handleProcessItau}
                  disabled={isExtracting || !itauRawText.trim()}
                  className="px-6 py-2 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-900/10 disabled:opacity-50 flex items-center gap-2"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Decodificar Dados
                    </>
                  )}
                </button>
              </div>
            </div>

            {itauExtractedData.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden"
              >
                <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-neutral-900">Dados Decodificados</h3>
                    <p className="text-xs text-neutral-500">{itauExtractedData.length} transações encontradas.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadStatementAsCSV({ name: `Extrato_Itaú_${new Date().toLocaleDateString('pt-BR')}`, transactions: itauExtractedData })}
                      className="flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg text-sm font-bold hover:bg-neutral-200 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Baixar CSV
                    </button>
                    <button
                      onClick={handleSaveStatement}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors shadow-md shadow-green-600/10"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Salvar Extrato
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 text-neutral-500 text-[10px] font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Data</th>
                        <th className="px-6 py-3">Descrição</th>
                        <th className="px-6 py-3">Doc/Ref</th>
                        <th className="px-6 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {itauExtractedData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                          <td className="px-6 py-4 text-xs text-neutral-600">
                            {new Date(item.date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-neutral-900">
                            {item.description}
                          </td>
                          <td className="px-6 py-4 text-xs text-neutral-500">
                            {item.doc_number || '-'}
                          </td>
                          <td className={`px-6 py-4 text-xs font-bold text-right ${item.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
              <h3 className="font-bold text-neutral-900">Historico de Extratos Salvos</h3>
              <p className="text-sm text-neutral-500">Visualize extratos que foram decodificados e salvos anteriormente.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedStatements.map((stmt) => (
                <div key={stmt.id} className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-neutral-100 rounded-lg">
                      <FilePlus className="w-5 h-5 text-neutral-600" />
                    </div>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase">
                      {new Date(stmt.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <h4 className="font-bold text-neutral-900 mb-1">{stmt.name}</h4>
                  <p className="text-xs text-neutral-500 mb-4">{stmt.transactions?.length || 0} transações identificadas</p>
                  
                  <div className="pt-4 border-t border-neutral-100 flex justify-between items-center">
                    <span className="text-[10px] text-neutral-400">Por: {stmt.created_by}</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => downloadStatementAsCSV(stmt)}
                        className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600 transition-colors"
                        title="Baixar CSV"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setItauExtractedData(stmt.transactions);
                          setFinanceMainTab('itau');
                          toast.success('Extrato carregado para visualização!');
                        }}
                        className="text-xs font-bold text-neutral-900 hover:underline"
                      >
                        Ver Detalhes
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {savedStatements.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-neutral-300">
                  <p className="text-neutral-400 text-sm">Nenhum extrato salvo ainda.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    ) : activeTab === 'bi' ? (
      <motion.div
        key="bi"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="space-y-8"
      >
        {/* BI Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Receipt className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-bold text-neutral-500 uppercase">Ticket Médio Geral</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900">
              {(financeStats.biData.reduce((acc, curr) => acc + curr.avgTicket, 0) / (financeStats.biData.length || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <p className="text-[10px] text-neutral-500 mt-1">Média ponderada por empresa</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-xs font-bold text-neutral-500 uppercase">Lead Time Médio</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900">
              {(financeStats.biData.reduce((acc, curr) => acc + curr.avgLeadTime, 0) / (financeStats.biData.length || 1)).toFixed(1)} dias
            </p>
            <p className="text-[10px] text-neutral-500 mt-1">Tempo médio para liquidação</p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-xs font-bold text-neutral-500 uppercase">Taxa de Adimplência</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {(financeStats.biData.reduce((acc, curr) => acc + curr.paymentRate, 0) / (financeStats.biData.length || 1)).toFixed(1)}%
            </p>
            <p className="text-[10px] text-green-500 mt-1">Média de faturas pagas</p>
          </div>
        </div>

        {/* BI Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <BarChartIcon className="w-5 h-5 text-neutral-900" />
              <h3 className="font-bold text-neutral-900">Ticket Médio por Empresa</h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financeStats.biData.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                  <XAxis type="number" fontSize={10} hide />
                  <YAxis dataKey="name" type="category" fontSize={10} width={100} tickLine={false} axisLine={false} />
                  <Tooltip 
                    formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="avgTicket" name="Ticket Médio" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-5 h-5 text-neutral-900" />
              <h3 className="font-bold text-neutral-900">Lead Time de Pagamento (Dias)</h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financeStats.biData.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                  <XAxis type="number" fontSize={10} hide />
                  <YAxis dataKey="name" type="category" fontSize={10} width={100} tickLine={false} axisLine={false} />
                  <Tooltip 
                    formatter={(value: number) => `${value.toFixed(1)} dias`}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="avgLeadTime" name="Lead Time Médio" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* BI Table */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-neutral-100">
            <h3 className="font-bold text-neutral-900">Ranking de Performance por Cliente</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-neutral-50 text-neutral-500 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Empresa</th>
                  <th className="px-6 py-3 text-right">Ticket Médio</th>
                  <th className="px-6 py-3 text-right">Faturamento Pago</th>
                  <th className="px-6 py-3 text-center">Lead Time</th>
                  <th className="px-6 py-3 text-center">Adimplência</th>
                  <th className="px-6 py-3 text-center">Status BI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {financeStats.biData.map(item => (
                  <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-neutral-900">{item.name}</div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-neutral-600">
                      {item.avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-green-600">
                      {item.totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-sm font-medium ${item.avgLeadTime > 5 ? 'text-red-600' : item.avgLeadTime > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {item.avgLeadTime.toFixed(1)} dias
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-neutral-100 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${item.paymentRate > 90 ? 'bg-green-500' : item.paymentRate > 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${item.paymentRate}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-neutral-600">{item.paymentRate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.paymentRate > 90 && item.avgLeadTime <= 2 ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase">Excelente</span>
                      ) : item.paymentRate < 70 || item.avgLeadTime > 7 ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase">Risco</span>
                      ) : (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase">Atenção</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    ) : activeTab === 'tariffs' ? (
      <motion.div
        key="tariffs"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <TariffManager profile={profile} />
      </motion.div>
    ) : activeTab === 'companies' ? (
      <motion.div
        key="companies"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <CompanyManager profile={profile} />
      </motion.div>
    ) : activeTab === 'users' ? (
      <motion.div
        key="users"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <StaffManager currentUser={profile} />
      </motion.div>
    ) : activeTab === 'guests' ? (
      <motion.div
        key="guests"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <GuestManager profile={profile} />
      </motion.div>
    ) : activeTab === 'tracking' ? (
      <motion.div
        key="tracking"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <InvoiceTracker profile={profile} />
      </motion.div>
    ) : (
      <motion.div
        key="assembly"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="space-y-8"
      >
        <div className="bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-neutral-900 rounded-xl">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900">Montagem de Documentos</h2>
              <p className="text-sm text-neutral-500 text-left">Una múltiplos PDFs em um único documento profissional.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Configuração */}
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Empresa Destinatária</label>
                <select
                  value={assemblyCompanyId}
                  onChange={(e) => setAssemblyCompanyId(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                >
                  <option value="">Selecione uma empresa...</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Tipo de Documento</label>
                  <select
                    value={assemblyFileType}
                    onChange={(e) => setAssemblyFileType(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                  >
                    {FINANCIAL_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Nome do Arquivo (Opcional)</label>
                  <input
                    type="text"
                    value={assemblyFileName}
                    onChange={(e) => setAssemblyFileName(e.target.value)}
                    placeholder="Ex: Fatura_Servicos_TI"
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Valor Total</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={assemblyAmount}
                      onChange={(e) => setAssemblyAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Vencimento</label>
                  <input
                    type="date"
                    value={assemblyDueDate}
                    onChange={(e) => setAssemblyDueDate(e.target.value)}
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-900 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Adicionar Arquivos (PDF)</label>
                <div className="relative group">
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        setAssemblyFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="w-full py-8 border-2 border-dashed border-neutral-200 rounded-2xl flex flex-col items-center justify-center gap-2 bg-neutral-50 group-hover:bg-neutral-100 group-hover:border-neutral-300 transition-all">
                    <FilePlus className="w-8 h-8 text-neutral-400" />
                    <p className="text-sm font-medium text-neutral-600">Clique ou arraste PDFs aqui</p>
                    <p className="text-[10px] text-neutral-400 uppercase font-bold">Apenas arquivos PDF são aceitos</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleMergeAndUpload}
                disabled={isMerging || assemblyFiles.length === 0}
                className="w-full py-4 bg-neutral-900 text-white rounded-xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-lg shadow-neutral-900/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando e Unificando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Gerar e Enviar Documento Unificado
                  </>
                )}
              </button>
            </div>

            {/* Lista de Arquivos */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Ordem dos Arquivos ({assemblyFiles.length})</label>
                {assemblyFiles.length > 0 && (
                  <button 
                    onClick={() => setAssemblyFiles([])}
                    className="text-[10px] font-bold text-red-600 uppercase hover:underline"
                  >
                    Limpar Tudo
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {assemblyFiles.map((file, index) => (
                  <motion.div
                    layout
                    key={`${file.name}-${index}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xl group"
                  >
                    <div className="flex flex-col gap-1">
                      <button 
                        onClick={() => moveFile(index, 'up')}
                        disabled={index === 0}
                        className="p-1 hover:bg-white rounded transition-colors disabled:opacity-20"
                      >
                        <ArrowUp className="w-3 h-3 text-neutral-600" />
                      </button>
                      <button 
                        onClick={() => moveFile(index, 'down')}
                        disabled={index === assemblyFiles.length - 1}
                        className="p-1 hover:bg-white rounded transition-colors disabled:opacity-20"
                      >
                        <ArrowDown className="w-3 h-3 text-neutral-600" />
                      </button>
                    </div>
                    
                    <div className="p-2 bg-white rounded-lg border border-neutral-100">
                      <FileText className="w-4 h-4 text-neutral-400" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-neutral-500 uppercase font-bold">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>

                    <button 
                      onClick={() => removeAssemblyFile(index)}
                      className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}

                {assemblyFiles.length === 0 && (
                  <div className="py-20 text-center border-2 border-dashed border-neutral-100 rounded-2xl">
                    <p className="text-sm text-neutral-400">Nenhum arquivo adicionado à fila.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>

  {/* Cancel Reason Modal */}
  <AnimatePresence>
    {cancelModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
            <h3 className="text-lg font-bold text-neutral-900">Cancelar Fatura</h3>
            <button 
              onClick={() => setCancelModalOpen(false)}
              className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleCancelFile} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-500 uppercase">Justificativa do Cancelamento</label>
              <textarea
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Informe o motivo do cancelamento (obrigatório)..."
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all min-h-[120px]"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    )}
    {/* File Details Modal (Proof/Dispute) */}
    <AnimatePresence>
      {viewingFileDetails && (
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
            className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                {viewingFileDetails.disputeAt ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <Receipt className="w-5 h-5 text-green-600" />}
                {viewingFileDetails.disputeAt ? 'Detalhes da Contestação' : 'Comprovante de Pagamento'}
              </h3>
              <button onClick={() => setViewingFileDetails(null)} className="p-2 hover:bg-neutral-100 rounded-full">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {viewingFileDetails.disputeAt && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <p className="text-xs font-bold text-red-600 uppercase mb-1">Motivo da Contestação</p>
                  <p className="text-sm text-red-900">{viewingFileDetails.disputeReason}</p>
                  <p className="text-[10px] text-red-400 mt-2">Enviado em: {new Date(viewingFileDetails.disputeAt).toLocaleString('pt-BR')}</p>
                  
                  {viewingFileDetails.disputeImages && viewingFileDetails.disputeImages.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-bold text-red-600 uppercase mb-2">Imagens Anexadas</p>
                      <div className="flex flex-wrap gap-2">
                        {viewingFileDetails.disputeImages.map((img, i) => (
                          <a key={i} href={img} target="_blank" rel="noreferrer" className="w-20 h-20 rounded-lg overflow-hidden border border-red-200 hover:opacity-80 transition-opacity">
                            <img src={img} alt={`Anexo ${i+1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-6 pt-6 border-t border-red-100">
                    <p className="text-xs font-bold text-red-600 uppercase mb-2">Responder Contestação</p>
                    {viewingFileDetails.disputeResponse ? (
                      <div className="bg-white p-3 rounded-lg border border-red-100">
                        <p className="text-sm text-neutral-700 italic">"{viewingFileDetails.disputeResponse}"</p>
                        <p className="text-[10px] text-neutral-400 mt-2">Respondido em: {new Date(viewingFileDetails.disputeResolvedAt || '').toLocaleString('pt-BR')}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <textarea
                          value={disputeResponse}
                          onChange={(e) => setDisputeResponse(e.target.value)}
                          placeholder="Escreva sua resposta para o cliente..."
                          className="w-full px-4 py-3 bg-white border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all min-h-[100px]"
                        />
                        <button
                          onClick={handleResolveDispute}
                          disabled={!disputeResponse || resolvingDispute}
                          className="w-full py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                          {resolvingDispute ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Enviar Resposta e Resolver
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewingFileDetails.proofUrl && (
                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                  <p className="text-xs font-bold text-green-600 uppercase mb-2">Comprovante de Pagamento</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <FileText className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-green-900">Arquivo de Comprovante</p>
                        <p className="text-[10px] text-green-400">Enviado em: {new Date(viewingFileDetails.proofDate || '').toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                    <a 
                      href={viewingFileDetails.proofUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700 transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Visualizar
                    </a>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => setViewingFileDetails(null)}
                  className="px-6 py-2 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </AnimatePresence>
</div>
);
}
