-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT,
  role TEXT DEFAULT 'client',
  company_id UUID,
  photo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create files table
CREATE TABLE IF NOT EXISTS public.files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  type TEXT,
  category TEXT,
  amount DECIMAL(12, 2),
  due_date DATE,
  period TEXT,
  status TEXT DEFAULT 'PENDING',
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID,
  viewed_by_client BOOLEAN DEFAULT false,
  dispute_response TEXT,
  dispute_resolved_at TIMESTAMP WITH TIME ZONE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  details JSONB,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create bank_accounts table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  institution TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  agency TEXT NOT NULL,
  account TEXT NOT NULL,
  pix_key TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create tariffs table
CREATE TABLE IF NOT EXISTS public.tariffs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  base_rate DECIMAL(12, 2) NOT NULL,
  percentage DECIMAL(5, 2) NOT NULL,
  room_type TEXT,
  category TEXT,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariffs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
CREATE POLICY "Users can insert their own profile." ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Companies Policies
DROP POLICY IF EXISTS "Companies are viewable by authenticated users." ON public.companies;
CREATE POLICY "Companies are viewable by authenticated users." ON public.companies
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only admins can manage companies." ON public.companies;
CREATE POLICY "Only admins can manage companies." ON public.companies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Files Policies
DROP POLICY IF EXISTS "Files are viewable by authenticated users." ON public.files;
CREATE POLICY "Files are viewable by authenticated users." ON public.files
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only admins can manage files." ON public.files;
CREATE POLICY "Only admins can manage files." ON public.files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Audit Logs Policies
DROP POLICY IF EXISTS "Admins can view audit logs." ON public.audit_logs;
CREATE POLICY "Admins can view audit logs." ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert audit logs." ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs." ON public.audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Notifications Policies
DROP POLICY IF EXISTS "Users can view their own notifications." ON public.notifications;
CREATE POLICY "Users can view their own notifications." ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications." ON public.notifications;
CREATE POLICY "Users can update their own notifications." ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications." ON public.notifications;
CREATE POLICY "System can insert notifications." ON public.notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Bank Accounts Policies
DROP POLICY IF EXISTS "Bank accounts are viewable by authenticated users." ON public.bank_accounts;
CREATE POLICY "Bank accounts are viewable by authenticated users." ON public.bank_accounts
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only admins can manage bank accounts." ON public.bank_accounts;
CREATE POLICY "Only admins can manage bank accounts." ON public.bank_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Tariffs Policies
DROP POLICY IF EXISTS "Tariffs are viewable by authenticated users." ON public.tariffs;
CREATE POLICY "Tariffs are viewable by authenticated users." ON public.tariffs
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only admins and reservations can manage tariffs." ON public.tariffs;
CREATE POLICY "Only admins and reservations can manage tariffs." ON public.tariffs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'reservations')
    )
  );

-- Create storage bucket for files
-- Note: This part might need manual setup in Supabase UI if the API is restricted
-- But we can define the policies here.

-- Storage Policies
-- Make sure to create a bucket named 'files' in Supabase Storage
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'files');

DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
CREATE POLICY "Authenticated users can upload files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;
CREATE POLICY "Authenticated users can delete files" ON storage.objects FOR DELETE USING (bucket_id = 'files' AND auth.role() = 'authenticated');
