/**
 * Sistema de "zoom" para a busca global.
 * Após uma navegação, tenta localizar o elemento com data-focus-id correspondente,
 * faz scroll suave até ele e aplica um destaque temporário.
 */

export interface FocusTarget {
  type: 'company' | 'file' | 'user' | string;
  id: string;
  name?: string;
}

export const consumeFocusTarget = (): FocusTarget | null => {
  try {
    const raw = sessionStorage.getItem('focusTarget');
    if (!raw) return null;
    sessionStorage.removeItem('focusTarget');
    return JSON.parse(raw) as FocusTarget;
  } catch {
    return null;
  }
};

export const clearFocusTarget = () => {
  try { sessionStorage.removeItem('focusTarget'); } catch {}
};

/**
 * Tenta encontrar o elemento alvo, scrolla até ele e aplica um highlight.
 * Faz várias tentativas para acomodar componentes que carregam dados async.
 */
export const tryFocusElement = (id: string, opts?: { attempts?: number; delayMs?: number }) => {
  const attempts = opts?.attempts ?? 12;
  const delayMs = opts?.delayMs ?? 250;
  let tries = 0;

  const attempt = () => {
    tries++;
    const el = document.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(id)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('focus-highlight');
      setTimeout(() => el.classList.remove('focus-highlight'), 2400);
      clearFocusTarget();
      return;
    }
    if (tries < attempts) setTimeout(attempt, delayMs);
    else clearFocusTarget(); // desiste sem deixar lixo
  };

  // pequeno delay inicial para o componente terminar o primeiro paint
  setTimeout(attempt, 150);
};

/**
 * Hook-like helper: chama isso no useEffect de cada view que pode ser alvo.
 * Verifica se há um focusTarget pendente e age sobre ele.
 */
export const handlePendingFocus = (acceptedTypes?: string[]) => {
  const target = consumeFocusTarget();
  if (!target) return;
  if (acceptedTypes && !acceptedTypes.includes(target.type)) {
    // recoloca para outro componente consumir
    try { sessionStorage.setItem('focusTarget', JSON.stringify(target)); } catch {}
    return;
  }
  tryFocusElement(target.id);
};
