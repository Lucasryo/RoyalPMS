# Hotel Management System - Sistema de Gerenciamento Hoteleiro

Sistema completo de gerenciamento hoteleiro local com Electron, SQLite e React.

## 🚀 Instalação

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente (Opcional)

A chave da API Gemini é **opcional**. O sistema funciona perfeitamente sem ela.

Se quiser usar extração automática de dados de documentos, adicione sua chave em `.env.local`:

```bash
# .env.local
GEMINI_API_KEY=sua_chave_aqui
```

> **Nota:** Sem a chave Gemini, o sistema funciona normalmente, apenas não terá extração automática de datas de vencimento de documentos.

## 🔧 Desenvolvimento

### Iniciar em modo desenvolvimento:

```bash
npm run desktop
```

Isso irá:
- Iniciar o servidor Express na porta 3000
- Abrir a aplicação Electron
- Habilitar hot-reload e DevTools

## 📦 Build para Produção

### Gerar executável Windows:

```bash
npm run build:exe
```

O executável portátil será gerado em `dist_desktop/`

## 🗄️ Banco de Dados

O sistema usa **SQLite** para armazenamento local seguro:

- **Desenvolvimento:** `database/hotel.db`
- **Produção:** `%APPDATA%/hotel-management-system/database/hotel.db`

### Tabelas criadas automaticamente:
- `profiles` - Usuários do sistema
- `companies` - Empresas cadastradas
- `reservations` - Reservas de quartos
- `events` - Eventos e salões
- `files` - Documentos e arquivos
- `audit_logs` - Logs de auditoria
- `notifications` - Notificações
- `bank_accounts` - Contas bancárias
- `tariffs` - Tarifas e preços

## 🔐 Login Padrão

**Email:** lucaszaous@gmail.com  
**Senha:** admin123

> **⚠️ Importante:** Altere a senha padrão após o primeiro login!

## 📁 Estrutura do Projeto

```
GerandoVoucher/
├── src/                    # Código React
│   ├── components/         # Componentes da UI
│   ├── lib/               # Utilitários e helpers
│   └── types.ts           # Definições TypeScript
├── electron/              # Código Electron
│   └── main.cjs          # Processo principal
├── server.ts             # Servidor Express + SQLite
├── database/             # Banco de dados local (gerado)
└── dist_desktop/         # Build final (gerado)
```

## 🔒 Segurança

- ✅ Senhas com hash bcrypt (10 rounds)
- ✅ Banco de dados local SQLite com WAL mode
- ✅ Sem exposição de dados na internet
- ✅ Autenticação local segura
- ✅ Armazenamento de arquivos local

## 🛠️ Scripts Disponíveis

```bash
npm run dev          # Apenas servidor (dev)
npm run build        # Build do frontend
npm run desktop      # Desenvolvimento Electron
npm run build:exe    # Build executável Windows
npm run clean        # Limpar builds
```

## ⚠️ Troubleshooting

### Erro ao iniciar o servidor
- Verifique se a porta 3000 está livre
- Confira se as dependências foram instaladas: `npm install`

### Erro no banco de dados
- Delete a pasta `database/` e reinicie
- O banco será recriado automaticamente com as tabelas

### Erro no build
- Execute `npm run clean` antes de `npm run build:exe`
- Verifique se todas as dependências estão instaladas
- Certifique-se de ter Node.js 18+ instalado

### Erro "bcrypt not found" no Windows
```bash
npm rebuild bcrypt --build-from-source
```

## 📝 Notas Importantes

1. **Backup:** Faça backup regular da pasta `database/`
2. **Atualizações:** Sempre execute `npm install` após atualizar o código
3. **Produção:** O executável é portátil e não requer instalação
4. **Dados:** Todos os dados ficam armazenados localmente (offline-first)
5. **Performance:** SQLite com WAL mode garante boa performance e concorrência

## 🆘 Suporte

Para problemas ou dúvidas, verifique:
- Logs em `database/server_logs.txt`
- Erros críticos em `database/critical_errors.txt`
- Console do DevTools (Ctrl+Shift+I no Electron)

## 🎯 Funcionalidades

- ✅ Gerenciamento de reservas
- ✅ Controle de eventos e salões
- ✅ Gestão de empresas e hóspedes
- ✅ Sistema financeiro e faturamento
- ✅ Upload e gerenciamento de documentos
- ✅ Controle de tarifas
- ✅ Auditoria completa
- ✅ Notificações
- ✅ Múltiplos perfis de usuário
- ✅ Dashboard com métricas
