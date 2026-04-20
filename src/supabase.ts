/**
 * LOCAL DATABASE CLIENT
 * This replaces Supabase to run entirely on local .txt files via a local Express server.
 */

const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // If running in Electron (file:// protocol) or local desktop build
    if (window.location.protocol === 'file:' || window.location.hostname === 'localhost') {
      return 'http://localhost:3000/api';
    }
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:3000/api';
};

export const BASE_URL = getBaseUrl();

let authChangeListeners: any[] = [];

// Helper to wait for the local server if needed
export const fetchWithRetry = async (url: string, options: any, retries = 5, delay = 1000): Promise<Response> => {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0) {
      console.log(`Server not ready, retrying... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay);
    }
    throw err;
  }
};

const normalizeValue = (value: unknown) => String(value ?? '').toLocaleLowerCase();

const matchLikePattern = (value: unknown, rawPattern: string) => {
  const normalizedValue = normalizeValue(value);
  const normalizedPattern = normalizeValue(rawPattern);

  if (normalizedPattern.startsWith('%') && normalizedPattern.endsWith('%')) {
    return normalizedValue.includes(normalizedPattern.slice(1, -1));
  }

  if (normalizedPattern.startsWith('%')) {
    return normalizedValue.endsWith(normalizedPattern.slice(1));
  }

  if (normalizedPattern.endsWith('%')) {
    return normalizedValue.startsWith(normalizedPattern.slice(0, -1));
  }

  return normalizedValue === normalizedPattern;
};

const applyOrFilter = (rows: any[], rawFilter: string) => {
  const conditions = rawFilter
    .split(',')
    .map(condition => condition.trim())
    .filter(Boolean);

  if (conditions.length === 0) {
    return rows;
  }

  return rows.filter(row =>
    conditions.some(condition => {
      const match = condition.match(/^([^.]+)\.(ilike|like|eq)\.(.+)$/i);
      if (!match) {
        return false;
      }

      const [, column, operator, rawValue] = match;
      const cellValue = row[column];

      switch (operator.toLowerCase()) {
        case 'ilike':
        case 'like':
          return matchLikePattern(cellValue, rawValue);
        case 'eq':
          return normalizeValue(cellValue) === normalizeValue(rawValue);
        default:
          return false;
      }
    })
  );
};

class LocalQueryBuilder {
  private table: string;
  private filters: any = {};
  private sorting: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private isSingle: boolean = false;
  private mutationData: any = null;
  private mutationType: 'INSERT' | 'UPDATE' | 'DELETE' | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*'): LocalQueryBuilder {
    return this;
  }

  eq(column: string, value: any): LocalQueryBuilder {
    this.filters[column] = value;
    return this;
  }

  in(column: string, values: any[]): LocalQueryBuilder {
    this.filters[column] = { $in: values };
    return this;
  }

  or(filter: string): LocalQueryBuilder {
    // Basic mock for "field.ilike.%term%,field2.ilike.%term%"
    this.filters.$or = filter;
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): LocalQueryBuilder {
    this.sorting = { column, ascending: options.ascending !== false };
    return this;
  }

  limit(count: number): LocalQueryBuilder {
    this.limitCount = count;
    return this;
  }

  not(column: string, operator: string, value: any): LocalQueryBuilder {
    if (operator === 'is' && value === null) {
      this.filters[`${column}!is`] = null;
    } else {
      this.filters[`${column}!${operator}`] = value;
    }
    return this;
  }

  single(): LocalQueryBuilder {
    this.isSingle = true;
    return this;
  }

  maybeSingle(): LocalQueryBuilder {
    this.isSingle = true;
    return this;
  }

  insert(items: any[]): LocalQueryBuilder {
    this.mutationType = 'INSERT';
    this.mutationData = items;
    return this;
  }

  update(patch: any): LocalQueryBuilder {
    this.mutationType = 'UPDATE';
    this.mutationData = patch;
    return this;
  }

  delete(): LocalQueryBuilder {
    this.mutationType = 'DELETE';
    return this;
  }

  async then(onfulfilled?: (value: any) => any) {
    let result: { data: any; error: any } = { data: null, error: null };

    try {
      if (this.mutationType === 'INSERT') {
        const results = [];
        for (const item of this.mutationData) {
          const response = await fetchWithRetry(`${BASE_URL}/db/${this.table}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
          });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || `Insert failed (${response.status})`);
          results.push(json);
        }
        result.data = this.isSingle ? (results.length > 0 ? results[0] : null) : results;
      } else if (this.mutationType === 'UPDATE') {
        const id = this.filters.id;
        if (!id) throw new Error('Update requires ID filter via .eq("id", value)');
        const response = await fetchWithRetry(`${BASE_URL}/db/${this.table}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.mutationData)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Update failed (${response.status})`);
        result.data = this.isSingle ? data : [data];
      } else if (this.mutationType === 'DELETE') {
        const id = this.filters.id;
        if (!id && this.table === 'tariffs' && this.filters.company_name) {
          await fetchWithRetry(`${BASE_URL}/db/tariffs/company/${encodeURIComponent(this.filters.company_name)}`, {
            method: 'DELETE'
          });
        } else if (id) {
          await fetchWithRetry(`${BASE_URL}/db/${this.table}/${id}`, { method: 'DELETE' });
        } else {
          throw new Error('Delete requires filter');
        }
      } else {
        // SELECT
        const response = await fetchWithRetry(`${BASE_URL}/db/${this.table}`, {});
        let data = await response.json();

        // Apply filters
        for (const [key, value] of Object.entries(this.filters)) {
          if (key === '$or') continue;
          
          if (key.includes('!')) {
            const [col, op] = key.split('!');
            if (op === 'is' && value === null) {
              data = data.filter((item: any) => item[col] !== null && item[col] !== undefined);
            } else {
              data = data.filter((item: any) => item[col] !== value);
            }
            continue;
          }

          if (typeof value === 'object' && value !== null && (value as any).$in) {
            data = data.filter((item: any) => (value as any).$in.includes(item[key]));
          } else {
            data = data.filter((item: any) => item[key] === value);
          }
        }
        
        // Apply $or for the search patterns used by the app.
        if (this.filters.$or) {
          data = applyOrFilter(data, this.filters.$or);
        }

        if (this.sorting) {
          const { column, ascending } = this.sorting;
          data.sort((a: any, b: any) => {
            if (a[column] < b[column]) return ascending ? -1 : 1;
            if (a[column] > b[column]) return ascending ? 1 : -1;
            return 0;
          });
        }

        if (this.limitCount !== null) {
          data = data.slice(0, this.limitCount);
        }

        result.data = this.isSingle ? (data.length > 0 ? data[0] : null) : data;
      }
    } catch (error: any) {
      result.error = { message: error.message };
    }

    return onfulfilled ? onfulfilled(result) : result;
  }
}

export const supabase = {
  from: (table: string) => new LocalQueryBuilder(table),
  auth: {
    getSession: async () => {
      const stored = localStorage.getItem('local_session');
      if (stored) return { data: { session: JSON.parse(stored) }, error: null };
      return { data: { session: null }, error: null };
    },
    onAuthStateChange: (callback: any) => {
      authChangeListeners.push(callback);
      // Immediately call with current session if exists
      const stored = localStorage.getItem('local_session');
      if (stored) {
        callback('SIGNED_IN', JSON.parse(stored));
      } else {
        callback('SIGNED_OUT', null);
      }
      return { 
        data: { 
          subscription: { 
            unsubscribe: () => {
              authChangeListeners = authChangeListeners.filter(l => l !== callback);
            } 
          } 
        } 
      };
    },
    signInWithPassword: async ({ email, password }: any) => {
      try {
        const response = await fetchWithRetry(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (response.ok) {
          const session = { user: data.user };
          localStorage.setItem('local_session', JSON.stringify(session));
          
          // Notify all listeners
          authChangeListeners.forEach(l => l('SIGNED_IN', session));
          
          return { data: session, error: null };
        }
        return { data: null, error: { message: data.error } };
      } catch (error: any) {
        console.error('Fetch error during login:', error);
        return { 
          data: null, 
          error: { 
            message: 'Não foi possível conectar ao servidor local. Por favor, aguarde um momento e tente novamente ou reinicie o aplicativo.' 
          } 
        };
      }
    },
    signInWithOAuth: async (options: any) => {
      return { error: { message: 'OAuth desativado no modo offline.' } };
    },
    signOut: async () => {
      localStorage.removeItem('local_session');
      window.location.reload();
      return { error: null };
    }
  },
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, file: Blob | File): Promise<{ data: any; error: any }> => {
        try {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64data = (reader.result as string).split(',')[1];
              const response = await fetchWithRetry(`${BASE_URL}/storage/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  path,
                  fileData: base64data,
                  fileName: (file as any).name || 'file'
                })
              });
              const data = await response.json();
              if (response.ok) resolve({ data, error: null });
              else resolve({ data: null, error: { message: data.error } });
            };
            reader.readAsDataURL(file);
          });
        } catch (error: any) {
          return { data: null, error: { message: error.message } };
        }
      },
      getPublicUrl: (path: string) => {
        return { data: { publicUrl: `${BASE_URL}/storage/view/${path}` } };
      },
      remove: async (paths: string[]) => {
        try {
          await fetchWithRetry(`${BASE_URL}/storage/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths })
          });
          return { error: null };
        } catch (error: any) {
          return { error: { message: error.message } };
        }
      }
    })
  },
  channel: (name: string) => ({
    on: (event: string, filter: any, callback: any) => ({
      subscribe: () => {}
    })
  }),
  removeChannel: (channel: any) => {}
};
