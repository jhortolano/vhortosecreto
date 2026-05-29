import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type EncuestaContactPick = {
  key: string;
  name: string;
  phone: string;
};

type Ctx = {
  selected: EncuestaContactPick[];
  toggle: (row: EncuestaContactPick) => void;
  setAll: (rows: EncuestaContactPick[]) => void;
  clear: () => void;
};

const CreateEncuestaContext = createContext<Ctx | null>(null);

export function CreateEncuestaProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<EncuestaContactPick[]>([]);

  const toggle = useCallback((row: EncuestaContactPick) => {
    setSelected((prev) => {
      const exists = prev.some((r) => r.key === row.key);
      if (exists) return prev.filter((r) => r.key !== row.key);
      return [...prev, row];
    });
  }, []);

  const setAll = useCallback((rows: EncuestaContactPick[]) => setSelected(rows), []);

  const clear = useCallback(() => setSelected([]), []);

  const value = useMemo(() => ({ selected, toggle, setAll, clear }), [selected, toggle, setAll, clear]);

  return <CreateEncuestaContext.Provider value={value}>{children}</CreateEncuestaContext.Provider>;
}

export function useCreateEncuesta() {
  const c = useContext(CreateEncuestaContext);
  if (!c) {
    throw new Error('useCreateEncuesta debe usarse dentro de CreateEncuestaProvider');
  }
  return c;
}
