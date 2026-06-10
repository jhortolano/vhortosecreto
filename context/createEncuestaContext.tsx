import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type EncuestaContactPick = {
  key: string;
  name: string;
  phone: string;
};

export type EncuestaFormData = {
  titulo: string;
  opciones: string[];
  multiopcion: boolean;
  imagenKey: string | null;
  imagenUrl: string | null;
  skipContacts: boolean;
};

type Ctx = {
  selected: EncuestaContactPick[];
  toggle: (row: EncuestaContactPick) => void;
  setAll: (rows: EncuestaContactPick[]) => void;
  formData: EncuestaFormData;
  setFormData: (data: Partial<EncuestaFormData>) => void;
  clear: () => void;
};

const defaultFormData: EncuestaFormData = {
  titulo: '',
  opciones: ['', ''],
  multiopcion: false,
  imagenKey: null,
  imagenUrl: null,
  skipContacts: false,
};

const CreateEncuestaContext = createContext<Ctx | null>(null);

export function CreateEncuestaProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<EncuestaContactPick[]>([]);
  const [formData, setFormDataState] = useState<EncuestaFormData>(defaultFormData);

  const toggle = useCallback((row: EncuestaContactPick) => {
    setSelected((prev) => {
      const exists = prev.some((r) => r.key === row.key);
      if (exists) return prev.filter((r) => r.key !== row.key);
      return [...prev, row];
    });
  }, []);

  const setAll = useCallback((rows: EncuestaContactPick[]) => setSelected(rows), []);

  const setFormData = useCallback((data: Partial<EncuestaFormData>) => {
    setFormDataState((prev) => ({ ...prev, ...data }));
  }, []);

  const clear = useCallback(() => {
    setSelected([]);
    setFormDataState(defaultFormData);
  }, []);

  const value = useMemo(
    () => ({ selected, toggle, setAll, formData, setFormData, clear }),
    [selected, toggle, setAll, formData, setFormData, clear],
  );

  return <CreateEncuestaContext.Provider value={value}>{children}</CreateEncuestaContext.Provider>;
}

export function useCreateEncuesta() {
  const c = useContext(CreateEncuestaContext);
  if (!c) {
    throw new Error('useCreateEncuesta debe usarse dentro de CreateEncuestaProvider');
  }
  return c;
}
