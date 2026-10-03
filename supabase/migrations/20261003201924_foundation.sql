-- Todas las escrituras comerciales pasan por funciones autorizadas.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.businesses (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200),
 status text not null default 'active' check(status in ('active','suspended')),
 currency text not null default 'C$', currency_code text not null default 'NIO', timezone text not null default 'America/Managua',
 tax_id text not null default '', phone text not null default '', address text not null default '', logo_path text,
 max_discount numeric(5,2) not null default 10 check(max_discount between 0 and 100),
 created_at timestamptz not null default now()
);
create table private.platform_admins(user_id uuid primary key references auth.users(id));
create table public.memberships (
 business_id uuid not null references public.businesses(id), user_id uuid not null references auth.users(id),
 role text not null check(role in ('ADMIN','VENDEDOR','CAJERO','BODEGUERO','CONTADOR','CONSULTA')),
 permissions text[] not null default '{}', active boolean not null default true,
 primary key(business_id,user_id)
);
create table public.branches(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), name text not null check(length(name)>0), unique(business_id,id), unique(business_id,name));
create table public.warehouses(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), branch_id uuid not null, name text not null check(length(name)>0), unique(business_id,id), foreign key(business_id,branch_id) references public.branches(business_id,id));
create table public.accounts (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), branch_id uuid not null,
 name text not null check(length(name)>0), kind text not null check(kind in ('cash','bank','card')),
 commission numeric(5,2) not null default 0 check(commission between 0 and 100), active boolean not null default true,
 unique(business_id,id), foreign key(business_id,branch_id) references public.branches(business_id,id)
);
create table public.parties (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 kind text not null check(kind in ('customer','supplier')), name text not null check(length(name) between 1 and 200),
 tax_id text not null default '', phone text not null default '', email text not null default '', address text not null default '',
 price_level text not null default 'public' check(price_level in ('public','wholesale')),
 credit_limit numeric(18,2) not null default 0 check(credit_limit>=0), credit_days integer not null default 30 check(credit_days between 0 and 3650),
 active boolean not null default true, created_at timestamptz not null default now(), unique(business_id,id)
);
create table public.products (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 code text not null check(length(code) between 1 and 80), barcode text, name text not null check(length(name) between 1 and 200),
 description text not null default '', category text not null default '', brand text not null default '', supplier_id uuid,
 unit text not null default 'unidad', fractional boolean not null default false,
 price numeric(18,2) not null check(price>=0), wholesale_price numeric(18,2) check(wholesale_price>=0),
 minimum numeric(18,6) not null default 0 check(minimum>=0), location text not null default '',
 tax_rate numeric(5,2) not null default 0 check(tax_rate between 0 and 100), active boolean not null default true,
 attributes jsonb not null default '{}', warranty_days integer not null default 0 check(warranty_days>=0), photo_path text,
 created_at timestamptz not null default now(), unique(business_id,id), unique(business_id,code),
 foreign key(business_id,supplier_id) references public.parties(business_id,id)
);
create unique index products_barcode on public.products(business_id,barcode) where barcode is not null;
create index products_search on public.products using gin(to_tsvector('simple',name || ' ' || code || ' ' || brand));
create table public.presentations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), product_id uuid not null,
 name text not null, factor numeric(18,6) not null check(factor>0), price numeric(18,2) not null check(price>=0),
 active boolean not null default true, unique(business_id,id), unique(business_id,product_id,name),
 foreign key(business_id,product_id) references public.products(business_id,id)
);
create table public.price_rules (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), product_id uuid not null,
 party_id uuid, min_quantity numeric(18,6) not null default 1 check(min_quantity>0), price numeric(18,2) not null check(price>=0),
 foreign key(business_id,product_id) references public.products(business_id,id), foreign key(business_id,party_id) references public.parties(business_id,id)
);
create table public.stock (
 business_id uuid not null references public.businesses(id), warehouse_id uuid not null, product_id uuid not null,
 physical numeric(18,6) not null default 0 check(physical>=0), reserved numeric(18,6) not null default 0 check(reserved>=0 and reserved<=physical),
 damaged numeric(18,6) not null default 0 check(damaged>=0), primary key(business_id,warehouse_id,product_id),
 foreign key(business_id,warehouse_id) references public.warehouses(business_id,id), foreign key(business_id,product_id) references public.products(business_id,id)
);
create table public.stock_costs (
 business_id uuid not null, warehouse_id uuid not null, product_id uuid not null, average numeric(18,6) not null default 0 check(average>=0),
 primary key(business_id,warehouse_id,product_id), foreign key(business_id,warehouse_id,product_id) references public.stock(business_id,warehouse_id,product_id)
);
create table public.sessions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), branch_id uuid not null,
 account_id uuid not null, user_id uuid not null references auth.users(id), opening numeric(18,2) not null check(opening>=0),
 opened_at timestamptz not null default now(), closed_at timestamptz, expected numeric(18,2), counted numeric(18,2), reason text not null default '',
 unique(business_id,id), foreign key(business_id,branch_id) references public.branches(business_id,id), foreign key(business_id,account_id) references public.accounts(business_id,id)
);
create unique index one_open_session on public.sessions(account_id) where closed_at is null;
create table public.documents (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), branch_id uuid not null, warehouse_id uuid not null,
 number bigint generated always as identity, kind text not null check(kind in ('sale','purchase','quote')),
 state text not null check(state in ('draft','confirmed','void','sent','accepted','rejected','expired')),
 party_id uuid, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 subtotal numeric(18,2) not null default 0, tax numeric(18,2) not null default 0, total numeric(18,2) not null default 0 check(total>=0),
 transport numeric(18,2) not null default 0 check(transport>=0), extra_cost numeric(18,2) not null default 0 check(extra_cost>=0),
 due_date date, valid_until date, deferred boolean not null default false, address text not null default '', notes text not null default '',
 origin_id uuid, unique(business_id,id), foreign key(business_id,branch_id) references public.branches(business_id,id),
 foreign key(business_id,warehouse_id) references public.warehouses(business_id,id), foreign key(business_id,party_id) references public.parties(business_id,id),
 foreign key(business_id,origin_id) references public.documents(business_id,id)
);
create index documents_period on public.documents(business_id,branch_id,created_at desc);
create table public.document_lines (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, document_id uuid not null, product_id uuid not null,
 presentation_id uuid not null, product_name text not null, presentation_name text not null,
 quantity numeric(18,6) not null check(quantity>0), factor numeric(18,6) not null check(factor>0), base_quantity numeric(18,6) not null check(base_quantity>0),
 price numeric(18,2) not null check(price>=0), discount numeric(18,2) not null default 0 check(discount>=0), tax_rate numeric(5,2) not null,
 subtotal numeric(18,2) not null check(subtotal>=0), tax numeric(18,2) not null check(tax>=0), total numeric(18,2) not null check(total>=0),
 received numeric(18,6) not null default 0 check(received>=0 and received<=base_quantity),
 delivered numeric(18,6) not null default 0 check(delivered>=0 and delivered<=base_quantity),
 returned numeric(18,6) not null default 0 check(returned>=0 and returned<=base_quantity), serial text not null default '', lot text not null default '',
 unique(business_id,id), foreign key(business_id,document_id) references public.documents(business_id,id),
 foreign key(business_id,product_id) references public.products(business_id,id), foreign key(business_id,presentation_id) references public.presentations(business_id,id)
);
create table public.line_costs (
 business_id uuid not null, line_id uuid not null, unit_cost numeric(18,6) not null check(unit_cost>=0),
 primary key(business_id,line_id), foreign key(business_id,line_id) references public.document_lines(business_id,id)
);
create table public.inventory_moves (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, warehouse_id uuid not null, product_id uuid not null,
 quantity numeric(18,6) not null, damaged_quantity numeric(18,6) not null default 0, kind text not null,
 origin_id uuid not null, reason text not null default '', user_id uuid references auth.users(id), created_at timestamptz not null default now(),
 foreign key(business_id,warehouse_id,product_id) references public.stock(business_id,warehouse_id,product_id)
);
create index inventory_moves_period on public.inventory_moves(business_id,warehouse_id,product_id,created_at desc);
create table public.payments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, branch_id uuid not null, party_id uuid,
 direction text not null check(direction in ('in','out')), amount numeric(18,2) not null check(amount>0),
 reference text not null default '', user_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(business_id,id), foreign key(business_id,branch_id) references public.branches(business_id,id), foreign key(business_id,party_id) references public.parties(business_id,id)
);
create table public.payment_applications (
 business_id uuid not null, payment_id uuid not null, document_id uuid not null, amount numeric(18,2) not null check(amount>0),
 primary key(payment_id,document_id), foreign key(business_id,payment_id) references public.payments(business_id,id), foreign key(business_id,document_id) references public.documents(business_id,id)
);
create table public.money_moves (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, branch_id uuid not null, account_id uuid not null, session_id uuid,
 amount numeric(18,2) not null check(amount<>0), kind text not null, origin_id uuid not null, reference text not null default '',
 user_id uuid references auth.users(id), created_at timestamptz not null default now(),
 foreign key(business_id,branch_id) references public.branches(business_id,id), foreign key(business_id,account_id) references public.accounts(business_id,id), foreign key(business_id,session_id) references public.sessions(business_id,id)
);
create index money_moves_period on public.money_moves(business_id,branch_id,created_at desc);
create table public.returns (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, document_id uuid not null, line_id uuid not null,
 quantity numeric(18,6) not null check(quantity>0), amount numeric(18,2) not null check(amount>=0), damaged boolean not null default false,
 reason text not null, user_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(business_id,document_id) references public.documents(business_id,id), foreign key(business_id,line_id) references public.document_lines(business_id,id)
);
create table public.deliveries (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, document_id uuid not null, line_id uuid not null,
 quantity numeric(18,6) not null check(quantity>0), contact text not null, proof_path text, user_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(business_id,document_id) references public.documents(business_id,id), foreign key(business_id,line_id) references public.document_lines(business_id,id)
);
create table public.transfers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, from_warehouse uuid not null, to_warehouse uuid not null, product_id uuid not null,
 quantity numeric(18,6) not null check(quantity>0), unit_cost numeric(18,6) not null check(unit_cost>=0), received_at timestamptz,
 user_id uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(business_id,id), check(from_warehouse<>to_warehouse),
 foreign key(business_id,from_warehouse) references public.warehouses(business_id,id), foreign key(business_id,to_warehouse) references public.warehouses(business_id,id), foreign key(business_id,product_id) references public.products(business_id,id)
);
create table public.employees (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), name text not null,
 salary numeric(18,2) not null check(salary>=0), frequency text not null check(frequency in ('weekly','fortnightly','monthly')), commission numeric(5,2) not null default 0 check(commission between 0 and 100), active boolean not null default true, unique(business_id,id)
);
create table public.expense_rules (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, branch_id uuid not null, description text not null,
 category text not null, amount numeric(18,2) not null check(amount>0), frequency text not null check(frequency in ('weekly','fortnightly','monthly')),
 next_date date not null, day_of_month integer not null check(day_of_month between 1 and 31), active boolean not null default true,
 unique(business_id,id), foreign key(business_id,branch_id) references public.branches(business_id,id)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, branch_id uuid not null, description text not null,
 category text not null, amount numeric(18,2) not null check(amount>0), due_date date not null, paid_at timestamptz,
 beneficiary text not null default '', proof_path text, rule_id uuid, user_id uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(business_id,id), unique(rule_id,due_date), foreign key(business_id,branch_id) references public.branches(business_id,id), foreign key(business_id,rule_id) references public.expense_rules(business_id,id)
);
create table public.warranties (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, line_id uuid not null, serial text not null default '',
 description text not null, state text not null default 'received' check(state in ('received','review','resolved','rejected')),
 created_at timestamptz not null default now(), foreign key(business_id,line_id) references public.document_lines(business_id,id)
);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), user_id uuid references auth.users(id),
 action text not null, origin_id uuid, data jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.requests (
 business_id uuid not null references public.businesses(id), request_id uuid not null, user_id uuid not null references auth.users(id),
 payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(business_id,request_id)
);

create function private.allowed(b uuid, permission text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
 select 1 from public.memberships m join public.businesses x on x.id=m.business_id
 where m.business_id=b and m.user_id=auth.uid() and m.active and x.status='active' and
 (m.role='ADMIN' or permission='read' or permission=any(m.permissions) or
 permission=any(case m.role
 when 'VENDEDOR' then array['products.read','parties.read','sale.create','quote.write','documents.read']
 when 'CAJERO' then array['products.read','parties.read','documents.read','payment.write','cash.write','money.read']
 when 'BODEGUERO' then array['products.read','purchase.receive','inventory.read','inventory.write','delivery.write','documents.read']
 when 'CONTADOR' then array['products.read','parties.read','documents.read','cost.read','report.read','export','money.read','expense.write','payment.write']
 when 'CONSULTA' then array['products.read','documents.read','report.read'] else array[]::text[] end)))
$$;
create function private.require(b uuid, p text) returns void language plpgsql stable security invoker set search_path='' as $$
begin if not private.allowed(b,p) then raise exception 'APP:No tienes permiso para esta acción o el negocio está suspendido.'; end if; end $$;

-- Leer no otorga permiso para costos, caja ni datos personales.
do $$ declare t text; p text; begin
 for t,p in select * from (values
 ('branches','read'),('warehouses','read'),('accounts','read'),('parties','parties.read'),('products','products.read'),('presentations','products.read'),('price_rules','products.read'),
 ('stock','products.read'),('stock_costs','cost.read'),('sessions','money.read'),('documents','documents.read'),('document_lines','documents.read'),('line_costs','cost.read'),
 ('inventory_moves','inventory.read'),('payments','money.read'),('payment_applications','documents.read'),('money_moves','money.read'),('returns','documents.read'),('deliveries','documents.read'),
 ('transfers','inventory.read'),('employees','users.write'),('expense_rules','expense.write'),('expenses','expense.write'),('warranties','documents.read'),('audit_log','users.write')) x(t,p)
 loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using (private.allowed(business_id,%L))',t,p);
 execute format('grant select on public.%I to authenticated',t);
 execute format('revoke insert,update,delete on public.%I from authenticated,anon',t);
 end loop;
end $$;
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
create policy business_read on public.businesses for select to authenticated using (exists(select 1 from public.memberships m where m.business_id=id and m.user_id=(select auth.uid()) and m.active));
create policy memberships_read on public.memberships for select to authenticated using (user_id=(select auth.uid()) or private.allowed(business_id,'users.write'));
grant select on public.businesses,public.memberships to authenticated;
revoke insert,update,delete on public.businesses,public.memberships from authenticated,anon;
alter table private.requests enable row level security;
alter table private.platform_admins enable row level security;
revoke all on all tables in schema private from public,anon,authenticated;

create view public.document_balances with (security_invoker=true) as
 select d.id,d.business_id,d.branch_id,d.number,d.kind,d.state,d.party_id,d.total,d.due_date,d.created_at,
 coalesce((select sum(a.amount) from public.payment_applications a where a.document_id=d.id),0) paid,
 coalesce((select sum(r.amount) from public.returns r where r.document_id=d.id),0) refunded,
 case when d.state='void' then 0 else d.total-coalesce((select sum(a.amount) from public.payment_applications a where a.document_id=d.id),0)-coalesce((select sum(r.amount) from public.returns r where r.document_id=d.id),0) end balance
 from public.documents d;
grant select on public.document_balances to authenticated;

-- Internos solo invocados por funciones autorizadas; no se exponen por PostgREST.
create function private.stock_move(b uuid,w uuid,p uuid,q numeric,c numeric,k text,o uuid,r text default '',damage numeric default 0) returns void
language plpgsql security definer set search_path='' as $$
declare s public.stock; avg_cost numeric;
begin
 insert into public.stock(business_id,warehouse_id,product_id) values(b,w,p) on conflict do nothing;
 insert into public.stock_costs(business_id,warehouse_id,product_id) values(b,w,p) on conflict do nothing;
 select * into s from public.stock where business_id=b and warehouse_id=w and product_id=p for update;
 select average into avg_cost from public.stock_costs where business_id=b and warehouse_id=w and product_id=p for update;
 if s.physical+q<s.reserved or s.damaged+damage<0 then raise exception 'APP:No hay existencias disponibles suficientes.'; end if;
 if q>0 then
 update public.stock_costs set average=(s.physical*avg_cost+q*c)/(s.physical+q) where business_id=b and warehouse_id=w and product_id=p;
 end if;
 update public.stock set physical=physical+q,damaged=damaged+damage where business_id=b and warehouse_id=w and product_id=p;
 insert into public.inventory_moves(business_id,warehouse_id,product_id,quantity,damaged_quantity,kind,origin_id,reason,user_id) values(b,w,p,q,damage,k,o,r,auth.uid());
end $$;
create function private.money_move(b uuid,a uuid,v numeric,k text,o uuid,ref text default '') returns void
language plpgsql security definer set search_path='' as $$
declare acc public.accounts; sess public.sessions; fee numeric;
begin
 if v=0 then return; end if;
 select * into acc from public.accounts where business_id=b and id=a and active for update;
 if not found then raise exception 'APP:Selecciona una cuenta activa de este negocio.'; end if;
 if acc.kind='cash' then
 select * into sess from public.sessions where business_id=b and account_id=a and closed_at is null and user_id=auth.uid() for update;
 if not found then raise exception 'APP:Abre tu turno de caja antes de cobrar o pagar en efectivo.'; end if;
 end if;
 insert into public.money_moves(business_id,branch_id,account_id,session_id,amount,kind,origin_id,reference,user_id) values(b,acc.branch_id,a,sess.id,v,k,o,ref,auth.uid());
 if acc.kind='card' and v>0 and k in ('sale','collection') then
 fee=round(v*acc.commission/100,2);
 if fee>0 then insert into public.money_moves(business_id,branch_id,account_id,amount,kind,origin_id,user_id) values(b,acc.branch_id,a,-fee,'card_fee',o,auth.uid()); end if;
 end if;
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.allowed(uuid,text),private.require(uuid,text) to authenticated;

-- Índices para cada referencia compuesta y políticas por negocio.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not in ('businesses') loop
 execute format('create index if not exists %I on public.%I(business_id)', t.tablename||'_tenant',t.tablename);
 end loop;
end $$;
