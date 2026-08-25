/**
 * 内存假 DB（仅供路由单测）— 模拟 drizzle 链式查询的可等待构建器
 *
 * 支持路由代码用到的子集：
 *   - select({...}).from(t).where(cond).orderBy(desc/asc(col)).groupBy(...).limit(n).offset(m)
 *   - insert(t).values(row).returning()
 *   - update(t).set(patch).where(cond).returning()
 *   - delete(t).where(cond).returning()
 *   - transaction(cb)
 *   - select 列的聚合：sql`coalesce(sum(col),0)` / max(col) / count(...)
 *   - 条件：eq / ne / gte / lte / gt / lt / like / inArray / and / or
 *
 * 行数据按 drizzle 列名（camelCase，如 userId/createdAt）存储；
 * 表名取自 drizzle Table 的 Symbol.for('drizzle:Name')。
 *
 * @module routes/helpers/fake-db
 */
export type AnyRow = Record<string, any>;

const NAME = Symbol.for('drizzle:Name');

interface TableState {
  rows: AnyRow[];
  nextId: number;
}

const state = new Map<string, TableState>();

/** 判断是否为 drizzle 列对象（Column 实例带 table + name，且无 queryChunks） */
function isColumn(v: any): boolean {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof v.name === 'string' &&
    !!v.table &&
    !!v.table[NAME] &&
    !v.queryChunks
  );
}

function tableNameOf(t: any): string {
  return t?.[NAME] ?? String(t);
}

/** 列对象 → 行上对应的 camelCase 键（drizzle 键名） */
function rowKeyOf(table: any, col: any): string {
  for (const k of Object.keys(table)) {
    if (table[k] === col) return k;
  }
  return col.name;
}

function colValue(table: any, col: any, row: AnyRow): any {
  return row[rowKeyOf(table, col)];
}

/* ───────── 表状态管理（测试辅助） ───────── */

export function resetFakeDb(): void {
  state.clear();
}

export function seedFakeDb(table: any, rows: AnyRow[]): void {
  const name = tableNameOf(table);
  const st = state.get(name) ?? { rows: [], nextId: 1 };
  for (const r of rows) {
    const row = { ...r };
    if (row.id == null) {
      row.id = st.nextId++;
    } else {
      st.nextId = Math.max(st.nextId, Number(row.id) + 1);
    }
    st.rows.push(row);
  }
  state.set(name, st);
}

function tableRows(table: any): AnyRow[] {
  const name = tableNameOf(table);
  return state.get(name)?.rows ?? [];
}

function pushRow(table: any, row: AnyRow): AnyRow {
  const name = tableNameOf(table);
  const st = state.get(name) ?? { rows: [], nextId: 1 };
  const r = { ...row };
  if (r.id == null) r.id = st.nextId++;
  else st.nextId = Math.max(st.nextId, Number(r.id) + 1);
  st.rows.push(r);
  state.set(name, st);
  return r;
}

/* ───────── SQL 表达式扁平化 / 条件解析 ───────── */

type Tok =
  | { kind: 'str'; v: string }
  | { kind: 'col'; table: any; col: any } // col = drizzle 列实例
  | { kind: 'val'; v: any }
  | { kind: 'arr'; v: any[] };

function flatten(v: any, out: Tok[] = []): Tok[] {
  if (v == null) return out;
  if (v.constructor?.name === 'StringChunk') {
    // drizzle 的 StringChunk 是对象（value: string | string[]），不是裸字符串
    const s = Array.isArray(v.value) ? v.value.join('') : String(v.value);
    out.push({ kind: 'str', v: s });
    return out;
  }
  if (typeof v === 'string') {
    out.push({ kind: 'str', v });
    return out;
  }
  if (v.constructor?.name === 'Param') {
    out.push({ kind: 'val', v: v.value });
    return out;
  }
  if (isColumn(v)) {
    out.push({ kind: 'col', table: v.table, col: v });
    return out;
  }
  if (Array.isArray(v)) {
    out.push({ kind: 'arr', v: v.map((e) => (e?.constructor?.name === 'Param' ? e.value : e)) });
    return out;
  }
  if (Array.isArray(v.queryChunks)) {
    for (const c of v.queryChunks) flatten(c, out);
    return out;
  }
  return out;
}

interface PToken {
  kind: 'lparen' | 'rparen' | 'str' | 'col' | 'val' | 'arr';
  v?: any;
  table?: any;
  col?: any;
}

function tokenize(toks: Tok[]): PToken[] {
  const out: PToken[] = [];
  for (const t of toks) {
    if (t.kind === 'str') {
      for (const part of t.v.split(/(\s+|\(|\))/)) {
        const p = part.trim();
        if (!p) continue;
        if (p === '(') out.push({ kind: 'lparen' });
        else if (p === ')') out.push({ kind: 'rparen' });
        else out.push({ kind: 'str', v: p });
      }
    } else if (t.kind === 'col') {
      out.push({ kind: 'col', table: t.table, col: t.col });
    } else if (t.kind === 'val') {
      out.push({ kind: 'val', v: t.v });
    } else if (t.kind === 'arr') {
      out.push({ kind: 'arr', v: t.v });
    }
  }
  return out;
}

interface CondNode {
  op?: string;
  table?: any;
  col?: any;
  val?: any;
  vals?: any[];
  and?: CondNode[];
  or?: CondNode[];
}

function parseCond(toks: PToken[], i: number): { node: CondNode; i: number } {
  if (toks[i]?.kind === 'lparen') {
    const r = parseAndOr(toks, i + 1);
    return { node: r.node, i: r.i + 1 };
  }
  const colTok = toks[i];
  const opTok = toks[i + 1];
  const valTok = toks[i + 2];
  if (!colTok || colTok.kind !== 'col') throw new Error(`FakeDB: 无法解析条件（token=${colTok?.kind ?? '?'}）`);
  const op = opTok?.kind === 'str' ? String(opTok.v) : '';
  if (op === 'in') {
    const vals = valTok?.kind === 'arr' ? valTok.v : [];
    return { node: { op, table: colTok.table, col: colTok.col, vals }, i: i + 3 };
  }
  let val: any;
  if (valTok?.kind === 'val') val = valTok.v;
  else if (valTok?.kind === 'col') val = { colRef: [valTok.table, valTok.col] };
  else if (valTok?.kind === 'str') val = valTok.v;
  return { node: { op, table: colTok.table, col: colTok.col, val }, i: i + 3 };
}

function parseAndOr(toks: PToken[], i: number): { node: CondNode; i: number } {
  const first = parseCond(toks, i);
  let node = first.node;
  let ni = first.i;
  let tok = toks[ni];
  while (tok?.kind === 'str' && (tok.v === 'and' || tok.v === 'or')) {
    const op = tok.v;
    const right = parseCond(toks, ni + 1);
    node = { [op]: [node, right.node] } as CondNode;
    ni = right.i;
    tok = toks[ni];
  }
  return { node, i: ni };
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function evalCondNode(node: CondNode | null | undefined, get: (t: any, c: any) => any): boolean {
  if (node == null) return true;
  if (node.and) return node.and.every((n) => evalCondNode(n, get));
  if (node.or) return node.or.some((n) => evalCondNode(n, get));
  const actual = get(node.table, node.col);
  const v = node.val;
  if (v && typeof v === 'object' && (v as any).colRef) {
    const other = get((v as any).colRef[0], (v as any).colRef[1]);
    switch (node.op) {
      case '=':
        return actual === other;
      case '<>':
        return actual !== other;
      default:
        return true;
    }
  }
  switch (node.op) {
    case '=':
      return actual === v;
    case '<>':
      return actual !== v;
    case '>=':
      return (actual as any) >= (v as any);
    case '<=':
      return (actual as any) <= (v as any);
    case '>':
      return (actual as any) > (v as any);
    case '<':
      return (actual as any) < (v as any);
    case 'like': {
      const pat = String(v ?? '').replace(/^['"]|['"]$/g, '');
      const re = new RegExp('^' + pat.split('%').map(escapeReg).join('.*') + '$', 'i');
      return re.test(String(actual ?? ''));
    }
    case 'in':
      return (node.vals ?? []).includes(actual);
    case 'is':
      return v === null ? actual === null || actual === undefined : actual === v;
    default:
      return true;
  }
}

function evalCond(cond: any, get: (t: any, c: any) => any): boolean {
  if (cond == null) return true;
  const toks = tokenize(flatten(cond));
  if (toks.length === 0) return true;
  const { node } = parseAndOr(toks, 0);
  return evalCondNode(node, get);
}

/* ───────── 聚合 / 投影 ───────── */

function aggregateKind(expr: any): 'count' | 'sum' | 'max' | 'avg' | null {
  const text = flatten(expr)
    .map((t) => (t.kind === 'str' ? t.v : t.kind === 'col' ? `"${t.table[NAME]}"."${t.col.name}"` : String(t.v)))
    .join('');
  if (text.includes('count(')) return 'count';
  if (text.includes('sum(')) return 'sum';
  if (text.includes('max(')) return 'max';
  if (text.includes('avg(')) return 'avg';
  return null;
}

function referencedColumn(expr: any): { table: any; col: any } | null {
  const c = flatten(expr).find((t) => t.kind === 'col');
  return c ? { table: c.table, col: c.col } : null;
}

function computeAggregate(expr: any, rows: AnyRow[]): any {
  const kind = aggregateKind(expr);
  const col = referencedColumn(expr);
  if (kind === 'count') return col ? rows.filter((r) => colValue(col.table, col.col, r) != null).length : rows.length;
  const values = col ? rows.map((r) => colValue(col.table, col.col, r)).filter((v) => v != null) : [];
  switch (kind) {
    case 'sum':
      return values.reduce((acc, v) => acc + Number(v), 0);
    case 'max': {
      if (values.length === 0) return null;
      return values.reduce((a, b) => (a > b ? a : b));
    }
    case 'avg':
      return values.length ? values.reduce((acc, v) => acc + Number(v), 0) / values.length : 0;
    default:
      return null;
  }
}

function project(cols: Record<string, any> | undefined, row: AnyRow | undefined, groupRows: AnyRow[]): AnyRow {
  if (!cols) return row ? { ...row } : {};
  const out: AnyRow = {};
  for (const [alias, expr] of Object.entries(cols)) {
    if (isColumn(expr)) {
      out[alias] = row ? colValue(expr.table, expr, row) : undefined;
    } else if (aggregateKind(expr)) {
      out[alias] = computeAggregate(expr, groupRows);
    } else {
      out[alias] = groupRows[0]?.[alias] ?? expr;
    }
  }
  return out;
}

/* ───────── 可等待的 select 构建器 ───────── */

class FakeSelect {
  table: any = null;
  cols: any;
  whereCond: any;
  orderBys: any[] = [];
  limitN?: number;
  offsetN = 0;
  groupCols: any[] = [];

  constructor(cols: any) {
    this.cols = cols;
  }

  from(t: any) {
    this.table = t;
    return this;
  }
  where(c: any) {
    this.whereCond = c;
    return this;
  }
  orderBy(...cols: any[]) {
    this.orderBys = cols;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  offset(n: number) {
    this.offsetN = n;
    return this;
  }
  groupBy(...cols: any[]) {
    this.groupCols = cols;
    return this;
  }
  leftJoin() {
    return this;
  }
  innerJoin() {
    return this;
  }
  rightJoin() {
    return this;
  }
  fullJoin() {
    return this;
  }

  async run(): Promise<AnyRow[]> {
    if (!this.table) return [];
    const src = tableRows(this.table).map((r) => ({ ...r }));
    const filtered = this.whereCond == null ? src : src.filter((r) => evalCond(this.whereCond, (t, c) => colValue(t, c, r)));

    let rows: AnyRow[];
    if (this.groupCols.length > 0) {
      const keyOf = (r: AnyRow) => this.groupCols.map((c) => String(colValue(this.table, c, r))).join('\u0001');
      const groups = new Map<string, AnyRow[]>();
      for (const r of filtered) {
        const k = keyOf(r);
        const g = groups.get(k) ?? [];
        g.push(r);
        groups.set(k, g);
      }
      rows = [...groups.values()].map((g) => project(this.cols, g[0], g));
    } else if (this.cols && Object.values(this.cols).some((e) => aggregateKind(e))) {
      // 纯聚合（无 groupBy）：全量一行
      rows = [project(this.cols, undefined, filtered)];
    } else if (this.cols) {
      rows = filtered.map((r) => project(this.cols, r, [r]));
    } else {
      rows = filtered.map((r) => ({ ...r }));
    }

    if (this.orderBys.length > 0) {
      rows = rows.slice().sort((a, b) => {
        for (const ob of this.orderBys) {
          const toks = flatten(ob);
          const colTok = toks.find((t) => t.kind === 'col');
          if (!colTok) continue;
          const text = toks.map((t) => (t.kind === 'str' ? t.v : '')).join(' ').toLowerCase();
          const dir = text.includes('desc') ? -1 : 1;
          const dbName = colTok.col.name;
          const key = rowKeyOf(this.table, colTok.col);
          const va = a[dbName] ?? a[key];
          const vb = b[dbName] ?? b[key];
          if (va === vb) continue;
          return (va < vb ? -1 : 1) * dir;
        }
        return 0;
      });
    }

    if (this.offsetN > 0) rows = rows.slice(this.offsetN);
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  then(onFulfilled?: (v: AnyRow[]) => any, onRejected?: (e: unknown) => any): Promise<any> {
    return this.run().then(onFulfilled, onRejected);
  }
}

/* ───────── insert / update / delete / transaction ───────── */

function makeInsert(table: any) {
  return {
    values(data: AnyRow) {
      const row = pushRow(table, data);
      const result = {
        returning: async () => [{ ...row }],
        returningAll: async () => [{ ...row }],
        onConflictDoNothing: () => result,
        onConflictDoUpdate: () => result,
      };
      return result;
    },
  };
}

function makeUpdate(table: any) {
  return {
    set(patch: AnyRow) {
      return {
        where(cond: any) {
          const run = async () => {
            const updated: AnyRow[] = [];
            for (const r of tableRows(table)) {
              if (evalCond(cond, (t, c) => colValue(t, c, r))) {
                Object.assign(r, { ...patch });
                updated.push({ ...r });
              }
            }
            return updated;
          };
          return {
            returning: async () => run(),
            then: (onFulfilled?: any, onRejected?: any) => run().then(onFulfilled, onRejected),
          };
        },
      };
    },
  };
}

function makeDelete(table: any) {
  return {
    where(cond: any) {
      const run = async () => {
        const removed: AnyRow[] = [];
        const rows = tableRows(table);
        for (let i = rows.length - 1; i >= 0; i--) {
          const r = rows[i];
          if (r && evalCond(cond, (t, c) => colValue(t, c, r))) {
            rows.splice(i, 1);
            removed.push(r);
          }
        }
        return removed;
      };
      return {
        returning: async () => run(),
        then: (onFulfilled?: any, onRejected?: any) => run().then(onFulfilled, onRejected),
      };
    },
  };
}

/* ───────── 对外入口 ───────── */

/**
 * 创建假 DB 实例（共享模块级内存状态；__seed/__rows/__reset 为测试辅助）
 */
export function createFakeDb(_schema: unknown) {
  const db: any = {
    select: (cols?: any) => new FakeSelect(cols),
    insert: (t: any) => makeInsert(t),
    update: (t: any) => makeUpdate(t),
    delete: (t: any) => makeDelete(t),
    transaction: async (cb: (tx: any) => Promise<any>) => cb(db),
    execute: async () => {
      throw new Error('FakeDB.execute 未实现（路由不应使用原始 SQL）');
    },
    // 测试辅助（路由代码不会调用）
    __reset: resetFakeDb,
    __seed: seedFakeDb,
    __rows: (t: any) => tableRows(t),
  };
  return db;
}
