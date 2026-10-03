export type Row = {
  [key: string]: string | number | boolean | null | Row[] | Row;
};
export type Context = {
  user: { id: string; email: string };
  businesses: {
    id: string;
    name: string;
    status: string;
    currency: string;
    timezone: string;
    role: string;
  }[];
  business: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    role: string;
    status: string;
  } | null;
  branches: Row[];
  warehouses: Row[];
  accounts: Row[];
  permissions: string[];
  superadmin: boolean;
};
