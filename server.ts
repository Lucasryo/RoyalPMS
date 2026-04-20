import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const DB_DIR = process.env.ELECTRON_DATA_PATH 
  ? path.join(process.env.ELECTRON_DATA_PATH, 'database')
  : path.join(process.cwd(), 'database');

const DB_PATH = path.join(DB_DIR, 'hotel.db');

// Ensure database directory exists
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'lucaszaous@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
const DEFAULT_ADMIN_ID = process.env.DEFAULT_ADMIN_ID || 'admin-id';
if (!process.env.DEFAULT_ADMIN_PASSWORD) {
  console.warn('[security] DEFAULT_ADMIN_PASSWORD não definida em .env.local — usando valor padrão. Defina uma senha forte em produção.');
}

// Initialize SQLite database
let db: Database.Database;

function initDatabase() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL'); // Better concurrency

  // Pre-migration: rename 'events' → 'hotel_events' BEFORE schema creation
  // This must run before db.exec so CREATE TABLE IF NOT EXISTS doesn't create an empty hotel_events
  try {
    const hasOldEvents = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get() as any;
    const hasHotelEvents = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hotel_events'").get() as any;
    if (hasOldEvents && !hasHotelEvents) {
      db.prepare('ALTER TABLE events RENAME TO hotel_events').run();
      console.log('✓ Pre-migration: events → hotel_events');
    } else if (hasOldEvents && hasHotelEvents) {
      // Both exist: copy old data into hotel_events then drop events
      const oldRows = db.prepare('SELECT * FROM events').all() as any[];
      if (oldRows.length > 0) {
        const cols = Object.keys(oldRows[0]).join(', ');
        const placeholders = Object.keys(oldRows[0]).map(() => '?').join(', ');
        const insertStmt = db.prepare(`INSERT OR IGNORE INTO hotel_events (${cols}) VALUES (${placeholders})`);
        const migrate = db.transaction((rows: any[]) => {
          for (const row of rows) insertStmt.run(...Object.values(row));
        });
        migrate(oldRows);
      }
      db.prepare('DROP TABLE events').run();
      console.log('✓ Pre-migration: merged events into hotel_events');
    }
  } catch (e) {
    console.warn('Pre-migration events warning:', e);
  }

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      company_id TEXT,
      phone TEXT,
      photo_url TEXT,
      permissions TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      cnpj TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      guest_name TEXT NOT NULL,
      room_number TEXT,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      status TEXT NOT NULL,
      company_id TEXT NOT NULL,
      total_amount REAL NOT NULL,
      reservation_code TEXT NOT NULL,
      cost_center TEXT,
      billing_obs TEXT,
      tariff REAL NOT NULL,
      category TEXT NOT NULL,
      guests_per_uh INTEGER NOT NULL,
      contact_phone TEXT NOT NULL,
      iss_tax REAL NOT NULL,
      service_tax REAL NOT NULL,
      payment_method TEXT NOT NULL,
      fiscal_data TEXT,
      billing_info TEXT,
      requested_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE TABLE IF NOT EXISTS hotel_events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      hall_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      attendees_count INTEGER NOT NULL,
      total_value REAL NOT NULL,
      status TEXT NOT NULL,
      items_included TEXT,
      client_profile TEXT,
      client_category TEXT,
      check_info TEXT,
      staff_roadmap TEXT,
      important_notes TEXT,
      company_id TEXT,
      os_number TEXT NOT NULL,
      cancelled_at TEXT,
      cancelled_by TEXT,
      cancel_reason TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reservation_requests (
      id TEXT PRIMARY KEY,
      guest_name TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'REQUESTED',
      company_id TEXT NOT NULL,
      total_amount REAL NOT NULL,
      reservation_code TEXT NOT NULL,
      cost_center TEXT,
      billing_obs TEXT,
      tariff REAL NOT NULL,
      category TEXT NOT NULL,
      guests_per_uh INTEGER NOT NULL,
      contact_phone TEXT NOT NULL,
      iss_tax REAL NOT NULL,
      service_tax REAL NOT NULL,
      payment_method TEXT,
      billing_info TEXT,
      requested_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      type TEXT NOT NULL,
      period TEXT,
      original_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      upload_date TEXT NOT NULL,
      uploader_id TEXT NOT NULL,
      download_url TEXT,
      due_date TEXT,
      viewed_by_client INTEGER DEFAULT 0,
      viewed_at TEXT,
      viewed_by_admin INTEGER DEFAULT 0,
      amount REAL,
      category TEXT,
      status TEXT,
      cancelled_at TEXT,
      cancelled_by TEXT,
      cancel_reason TEXT,
      proof_url TEXT,
      proof_date TEXT,
      dispute_reason TEXT,
      dispute_images TEXT,
      dispute_at TEXT,
      dispute_response TEXT,
      dispute_resolved_at TEXT,
      is_deleted INTEGER DEFAULT 0,
      deleted_at TEXT,
      deleted_by TEXT,
      billing_notifications_sent TEXT,
      tracking_stage TEXT,
      tracking_status TEXT,
      tracking_notes TEXT,
      tracking_updated_at TEXT,
      tracking_updated_by TEXT,
      nh TEXT,
      event_os_number TEXT,
      reservation_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      link TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      institution TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      agency TEXT NOT NULL,
      account TEXT NOT NULL,
      pix_key TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tariffs (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      base_rate REAL NOT NULL,
      percentage REAL NOT NULL,
      room_type TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS bank_statements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      period TEXT,
      transactions TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT,
      updated_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
    CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
    CREATE INDEX IF NOT EXISTS idx_reservations_company ON reservations(company_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_code ON reservations(reservation_code);
    CREATE INDEX IF NOT EXISTS idx_events_company ON hotel_events(company_id);
    CREATE INDEX IF NOT EXISTS idx_events_os ON hotel_events(os_number);
    CREATE INDEX IF NOT EXISTS idx_requests_company ON reservation_requests(company_id);
    CREATE INDEX IF NOT EXISTS idx_files_company ON files(company_id);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  `);

  // Migration: add permissions column if not exists
  try {
    db.prepare('ALTER TABLE profiles ADD COLUMN permissions TEXT').run();
  } catch (_) { /* column already exists */ }

  // Migration: add cancellation columns to hotel_events if not exists
  const hotelEventsMigrations = [
    'ALTER TABLE hotel_events ADD COLUMN cancelled_at TEXT',
    'ALTER TABLE hotel_events ADD COLUMN cancelled_by TEXT',
    'ALTER TABLE hotel_events ADD COLUMN cancel_reason TEXT',
    'ALTER TABLE hotel_events ADD COLUMN start_time TEXT',
    'ALTER TABLE hotel_events ADD COLUMN end_time TEXT',
    'ALTER TABLE hotel_events ADD COLUMN client_profile TEXT',
    'ALTER TABLE hotel_events ADD COLUMN client_category TEXT',
    'ALTER TABLE hotel_events ADD COLUMN check_info TEXT',
    'ALTER TABLE hotel_events ADD COLUMN staff_roadmap TEXT',
    'ALTER TABLE hotel_events ADD COLUMN important_notes TEXT',
    'ALTER TABLE hotel_events ADD COLUMN company_id TEXT',
    'ALTER TABLE hotel_events ADD COLUMN os_number TEXT',
  ];
  for (const sql of hotelEventsMigrations) {
    try { db.prepare(sql).run(); } catch (_) { /* column already exists */ }
  }

  // Migration: add bank_statements table if not exists (already in schema, safe to repeat)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS bank_statements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      period TEXT,
      transactions TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );`);
  } catch (_) {}

  // Migration: create reservation_requests if not exists (already in schema but safe to run)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS reservation_requests (
        id TEXT PRIMARY KEY,
        guest_name TEXT NOT NULL,
        check_in TEXT NOT NULL,
        check_out TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'REQUESTED',
        company_id TEXT NOT NULL,
        total_amount REAL NOT NULL,
        reservation_code TEXT NOT NULL,
        cost_center TEXT,
        billing_obs TEXT,
        tariff REAL NOT NULL,
        category TEXT NOT NULL,
        guests_per_uh INTEGER NOT NULL,
        contact_phone TEXT NOT NULL,
        iss_tax REAL NOT NULL,
        service_tax REAL NOT NULL,
        payment_method TEXT,
        billing_info TEXT,
        requested_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      );
    `);
  } catch (_) {}

  console.log('✓ Database initialized at:', DB_PATH);
}

async function ensureDefaultAdmin() {
  const admin = db.prepare('SELECT * FROM profiles WHERE email = ?').get(DEFAULT_ADMIN_EMAIL);
  
  if (!admin) {
    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    db.prepare(`
      INSERT INTO profiles (id, email, name, password, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(DEFAULT_ADMIN_ID, DEFAULT_ADMIN_EMAIL, 'Lucas Admin', hashedPassword, 'admin', new Date().toISOString());
    
    console.log('✓ Default admin created:', DEFAULT_ADMIN_EMAIL);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize database
  initDatabase();
  await ensureDefaultAdmin();

  // Simple logger
  const LOG_FILE = path.join(DB_DIR, 'server_logs.txt');
  app.use(async (req, res, next) => {
    const logEntry = `${new Date().toISOString()} - ${req.method} ${req.url}\n`;
    console.log(logEntry.trim());
    try {
      await fs.appendFile(LOG_FILE, logEntry);
    } catch(e) {}
    next();
  });

  // CORS restrito ao próprio app desktop (Electron) e ao dev server local
  app.use(cors({
    origin: (origin, cb) => {
      // sem origin (file://, electron, curl) e localhost são permitidos
      if (!origin) return cb(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      if (origin.startsWith('file://')) return cb(null, true);
      return cb(new Error('CORS bloqueado para origem: ' + origin));
    }
  }));
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString(), database: 'SQLite' });
  });

  const ALLOWED_TABLES = new Set([
    'profiles', 'companies', 'reservations', 'hotel_events', 'reservation_requests',
    'files', 'audit_logs', 'notifications', 'bank_accounts', 'tariffs', 'bank_statements',
    'app_settings'
  ]);

  // Generic GET all from table
  app.get('/api/db/:table', async (req, res) => {
    try {
      const { table } = req.params;
      if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
      let rows: any[] = db.prepare(`SELECT * FROM ${table}`).all();
      if (table === 'profiles') {
        rows = rows.map(r => {
          const { password, ...rest } = r;
          return { ...rest, permissions: rest.permissions ? JSON.parse(rest.permissions) : null };
        });
      }
      if (table === 'bank_statements') {
        rows = rows.map(r => ({ ...r, transactions: r.transactions ? JSON.parse(r.transactions) : [] }));
      }
      res.json(rows);
    } catch (error: any) {
      console.error(`Error reading ${req.params.table}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generic POST to table
  app.post('/api/db/:table', async (req, res) => {
    try {
      const { table } = req.params;
      if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
      const data = req.body;

      // Generate ID if not provided
      if (!data.id) {
        data.id = crypto.randomUUID();
      }

      // Serialize JSON fields for SQLite
      if (table === 'bank_statements' && data.transactions && typeof data.transactions === 'object') {
        data.transactions = JSON.stringify(data.transactions);
      }

      // Auto-generate slug for companies
      if (table === 'companies' && !data.slug && data.name) {
        const baseSlug = String(data.name)
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        data.slug = `${baseSlug}-${Date.now()}`;
      }

      // Add timestamps (only for tables that have a created_at column)
      const TABLES_WITHOUT_CREATED_AT = new Set(['audit_logs', 'notifications', 'app_settings']);
      if (!TABLES_WITHOUT_CREATED_AT.has(table) && !data.created_at) {
        data.created_at = new Date().toISOString();
      }
      
      // Build INSERT query
      const columns = Object.keys(data);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map(col => data[col]);
      
      const stmt = db.prepare(`
        INSERT INTO ${table} (${columns.join(', ')})
        VALUES (${placeholders})
      `);
      
      stmt.run(...values);
      res.json(data);
    } catch (error: any) {
      console.error(`Error inserting into ${req.params.table}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generic PUT to table
  app.put('/api/db/:table/:id', async (req, res) => {
    try {
      const { table, id } = req.params;
      if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
      const data = { ...req.body, updated_at: new Date().toISOString() };

      // Remove id from update data
      delete data.id;

      // Serialize object fields for SQLite
      if (table === 'profiles' && data.permissions && typeof data.permissions === 'object') {
        data.permissions = JSON.stringify(data.permissions);
      }

      // Normaliza email se presente (para login case-insensitive consistente)
      if (table === 'profiles' && typeof data.email === 'string') {
        data.email = data.email.trim().toLowerCase();
      }

      // Filtra colunas inexistentes para evitar "no such column"
      const tableInfo: any[] = db.prepare(`PRAGMA table_info(${table})`).all();
      const validColumns = new Set(tableInfo.map(c => c.name));
      const filtered: Record<string, any> = {};
      const dropped: string[] = [];
      for (const key of Object.keys(data)) {
        if (validColumns.has(key)) filtered[key] = data[key];
        else dropped.push(key);
      }
      if (dropped.length) {
        console.warn(`[PUT /api/db/${table}] Ignorando colunas inexistentes: ${dropped.join(', ')}`);
      }

      const columns = Object.keys(filtered);
      if (columns.length === 0) {
        return res.status(400).json({ error: 'Nenhuma coluna válida para atualizar' });
      }
      const setClause = columns.map(col => `${col} = ?`).join(', ');
      const values = [...columns.map(col => filtered[col]), id];

      const stmt = db.prepare(`
        UPDATE ${table}
        SET ${setClause}
        WHERE id = ?
      `);

      const result = stmt.run(...values);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Not found' });
      }

      let updated: any = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      if (table === 'profiles' && updated) {
        const { password, ...rest } = updated;
        updated = rest;
        if (updated?.permissions && typeof updated.permissions === 'string') {
          try { updated = { ...updated, permissions: JSON.parse(updated.permissions) }; } catch (_) {}
        }
      }
      res.json(updated);
    } catch (error: any) {
      console.error(`Error updating ${req.params.table}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Special route for "delete all tariffs for company" — DEVE vir ANTES da rota genérica
  app.delete('/api/db/tariffs/company/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const stmt = db.prepare('DELETE FROM tariffs WHERE company_name = ?');
      stmt.run(name);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting tariffs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generic DELETE from table
  app.delete('/api/db/:table/:id', async (req, res) => {
    try {
      const { table, id } = req.params;
      if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: 'Invalid table' });
      const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
      const result = stmt.run(id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error(`Error deleting from ${req.params.table}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── EVENTS: atomic cancel (event + all linked faturas in one transaction) ────
  app.post('/api/events/:id/cancel', (req, res) => {
    try {
      const { id } = req.params;
      const { reason, cancelled_by } = req.body;

      if (!reason?.trim()) {
        return res.status(400).json({ error: 'Motivo do cancelamento é obrigatório.' });
      }

      const event = db.prepare('SELECT * FROM hotel_events WHERE id = ?').get(id) as any;
      if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });
      if (event.status === 'cancelled') return res.status(400).json({ error: 'Evento já está cancelado.' });

      const now = new Date().toISOString();

      const cancelBoth = db.transaction(() => {
        db.prepare(`
          UPDATE hotel_events
          SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancel_reason = ?, updated_at = ?
          WHERE id = ?
        `).run(now, cancelled_by, reason, now, id);

        if (event.os_number) {
          db.prepare(`
            UPDATE files
            SET status = 'CANCELLED', cancel_reason = ?, cancelled_at = ?, cancelled_by = ?, updated_at = ?
            WHERE event_os_number = ? AND (status IS NULL OR status != 'CANCELLED')
          `).run(reason, now, cancelled_by, now, event.os_number);
        }
      });

      cancelBoth();
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error cancelling event:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── EVENTS: ensure every active event has a linked fatura ────────────────────
  app.post('/api/events/sync-faturas', (req, res) => {
    try {
      const { uploader_id } = req.body;
      const now = new Date().toISOString();

      // Find active events without an os_number and assign one
      const noOsEvents = db.prepare(
        "SELECT * FROM hotel_events WHERE (os_number IS NULL OR os_number = '') AND status != 'cancelled'"
      ).all() as any[];

      for (const ev of noOsEvents) {
        const os = `OS-${new Date(ev.created_at || now).getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        db.prepare("UPDATE hotel_events SET os_number = ?, updated_at = ? WHERE id = ?").run(os, now, ev.id);
        ev.os_number = os;
      }

      // Find active events whose os_number has no matching fatura
      const activeEvents = db.prepare(
        "SELECT * FROM hotel_events WHERE status != 'cancelled' AND os_number IS NOT NULL AND os_number != ''"
      ).all() as any[];

      let created = 0;
      for (const ev of activeEvents) {
        const existing = db.prepare(
          "SELECT id FROM files WHERE event_os_number = ?"
        ).get(ev.os_number);
        if (existing) continue;

        const startDate = ev.start_date || now.slice(0, 10);
        const period = startDate.slice(0, 7); // yyyy-MM
        const fileId = crypto.randomUUID();

        db.prepare(`
          INSERT INTO files
            (id, type, category, original_name, storage_path, amount, period, due_date,
             status, upload_date, uploader_id, company_id, event_os_number, reservation_code, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          fileId, 'Fatura Evento', 'Fatura Evento',
          `OS ${ev.os_number} - ${ev.name}`,
          `eventos/${ev.os_number}`,
          ev.total_value || 0, period, startDate,
          'PENDING', now,
          uploader_id || ev.created_by || 'system',
          ev.company_id || null,
          ev.os_number, ev.os_number, now
        );
        created++;
      }

      res.json({ success: true, fixed_os: noOsEvents.length, created_faturas: created });
    } catch (error: any) {
      console.error('Error syncing faturas:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // STORAGE: Save files locally
  app.post('/api/storage/upload', async (req, res) => {
    try {
      const { path: storagePath, fileData, fileName } = req.body;
      const fullPath = path.join(DB_DIR, 'local_storage', storagePath);
      const dir = path.dirname(fullPath);
      
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }

      // Convert base64 back to buffer
      const buffer = Buffer.from(fileData, 'base64');
      await fs.writeFile(fullPath, buffer);
      
      res.json({ success: true, path: storagePath });
    } catch (error: any) {
      console.error('Storage upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/storage/view/:path(*)', async (req, res) => {
    try {
      const storagePath = req.params.path;
      const fullPath = path.join(DB_DIR, 'local_storage', storagePath);
      if (existsSync(fullPath)) {
        res.sendFile(fullPath);
      } else {
        res.status(404).send('File not found');
      }
    } catch (error) {
      res.status(500).send('Error retrieving file');
    }
  });

  app.post('/api/storage/remove', async (req, res) => {
    try {
      const { paths } = req.body as { paths: string[] };
      for (const storagePath of paths || []) {
        const fullPath = path.join(DB_DIR, 'local_storage', storagePath);
        try { await fs.unlink(fullPath); } catch (_) {}
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin user creation
  app.post('/api/admin/create-user', async (req, res) => {
    try {
      const { email, name, role, companyId, password, permissions } = req.body;

      // Hash password
      const hashedPassword = await bcrypt.hash(password || 'user123', 10);

      const userId = crypto.randomUUID();
      const permissionsJson = permissions ? JSON.stringify(permissions) : null;
      const normalizedEmail = String(email || '').trim().toLowerCase();
      // Bloqueia duplicidade case-insensitive
      const existing: any = db.prepare('SELECT id FROM profiles WHERE LOWER(email) = ?').get(normalizedEmail);
      if (existing) {
        return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
      }
      const user = {
        id: userId,
        email: normalizedEmail,
        name,
        role: role || 'client',
        password: hashedPassword,
        company_id: companyId || null,
        permissions: permissionsJson,
        created_at: new Date().toISOString()
      };

      db.prepare(`
        INSERT INTO profiles (id, email, name, password, role, company_id, permissions, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, user.email, user.name, user.password, user.role, user.company_id, user.permissions, user.created_at);

      // Don't send password back
      const { password: _, ...userWithoutPassword } = user;
      res.json({ success: true, user: userWithoutPassword });
    } catch (error: any) {
      console.error('User creation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Authentication
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
      }
      
      const normalizedEmail = String(email).trim().toLowerCase();
      const user: any = db.prepare('SELECT * FROM profiles WHERE LOWER(email) = ?').get(normalizedEmail);

      if (!user) {
        return res.status(401).json({ error: 'Usuário não encontrado' });
      }
      
      // Verify password
      const isValid = await bcrypt.compare(password, user.password);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Senha incorreta' });
      }
      
      // Don't send password back
      const { password: _, ...userWithoutPassword } = user as any;
      if (userWithoutPassword.permissions && typeof userWithoutPassword.permissions === 'string') {
        try { userWithoutPassword.permissions = JSON.parse(userWithoutPassword.permissions); } catch (_) {}
      }
      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Graceful error handling
  process.on('uncaughtException', (err) => {
    const errorLog = `${new Date().toISOString()} - FATAL ERROR: ${err.stack || err.message}\n`;
    try { appendFileSync(path.join(DB_DIR, 'critical_errors.txt'), errorLog); } catch (_) {}
    console.error(errorLog);
    
    // Close database before exit
    if (db) {
      db.close();
    }
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    if (db) {
      db.close();
    }
    process.exit(0);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Database: ${DB_PATH}`);
    console.log(`✓ Storage: ${path.join(DB_DIR, 'local_storage')}`);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting Vite middleware...');
    try {
      // @ts-ignore
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('✓ Vite middleware started');
    } catch (e) {
      console.error('Failed to start Vite middleware:', e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
